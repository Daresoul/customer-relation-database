import React, { useState } from 'react';
import { Alert, App, Button, Form, Input, Modal, Radio, Segmented, Space, Table, Tag, Tooltip, Typography } from 'antd';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { useDeviceImport } from '@/contexts/useDeviceImport';
import { useDiscardLabResult, useLabInbox, useRestoreLabResult } from '@/hooks/useLabInbox';
import { labInboxService } from '@/services/labInboxService';
import { LoadError } from '@/components/common/LoadError';
import type { DiscardReason, LabInboxItem, LabInboxState } from '@/types/labInbox';
import LabValues from './LabValues';
import MoveLabResultModal from './MoveLabResultModal';
import { errorText } from '@/utils/notifyError';
import { formatDateTime } from '@/utils/dateFormatter';
import { labFailureText } from '@/utils/labFailure';

const { Text } = Typography;

const STATES: LabInboxState[] = ['waiting', 'attached', 'discarded'];
const REASONS: DiscardReason[] = ['qc', 'test', 'duplicate', 'other'];
const OVERDUE_HOURS = 24;

type MatchKind = 'chip' | 'name' | 'ambiguous' | 'none';
const MATCH_COLORS: Record<MatchKind, string | undefined> = { chip: 'green', name: 'gold', ambiguous: 'orange', none: undefined };

const matchKind = (item: LabInboxItem): MatchKind => {
  if (item.matchAmbiguous) return 'ambiguous';
  if (!item.matchedPatientId) return 'none';
  return item.matchMethod === 'microchip' ? 'chip' : 'name';
};

const isOverdue = (item: LabInboxItem) =>
  item.state === 'waiting' && dayjs().diff(dayjs(item.receivedAt), 'hour', true) > OVERDUE_HOURS;

/**
 * The lab inbox: every result a machine sent, waiting until it is attached
 * to a record or discarded with a reason.
 */
const LabInboxList: React.FC = () => {
  const { t } = useTranslation(['devices', 'common']);
  const { message, notification } = App.useApp();
  const [state, setState] = useState<LabInboxState>('waiting');
  const { data: items, isLoading, isError, refetch, isFetching } = useLabInbox(state);
  const discardMutation = useDiscardLabResult();
  const restoreMutation = useRestoreLabResult();
  const { receiveDeviceResult } = useDeviceImport();
  const [opening, setOpening] = useState<string | null>(null);
  const [discarding, setDiscarding] = useState<LabInboxItem | null>(null);
  const [moving, setMoving] = useState<LabInboxItem | null>(null);

  const handleAttach = async (item: LabInboxItem) => {
    setOpening(item.fileId);
    try {
      const data = await labInboxService.getDeviceData(item.fileId);
      receiveDeviceResult({
        id: `inbox-${item.fileId}`,
        deviceType: data.deviceType,
        deviceName: data.deviceName,
        connectionMethod: data.connectionMethod,
        fileName: data.originalFileName,
        fileData: data.fileData,
        mimeType: data.mimeType,
        testResults: data.testResults,
        patientId: item.matchAmbiguous ? undefined : item.matchedPatientId ?? undefined,
        patientIdentifier: item.machinePatientId ?? data.patientIdentifier ?? undefined,
        matchMethod: item.matchMethod,
        matchAmbiguous: item.matchAmbiguous,
        detectedAt: item.receivedAt,
        sourceFileId: item.fileId,
      });
    } catch (e) {
      notification.error({
        message: t('devices:inbox.openFailed'),
        description: errorText(e, t),
      });
    } finally {
      setOpening(null);
    }
  };

  const handleRestore = async (item: LabInboxItem) => {
    try {
      await restoreMutation.mutateAsync(item.fileId);
      message.success(t('devices:inbox.restored'));
    } catch (e) {
      notification.error({ message: t('devices:inbox.restoreFailed'), description: errorText(e, t) });
    }
  };

  const patientCell = (item: LabInboxItem) => {
    if (item.state === 'attached') {
      return (
        <Space direction="vertical" size={0}>
          {item.attachedPatientName && <Text strong>{item.attachedPatientName}</Text>}
          {item.attachedRecordId ? (
            <Link to={`/medical-records/${item.attachedRecordId}`}>
              {item.attachedRecordName || t('devices:inbox.openRecord')}
            </Link>
          ) : null}
        </Space>
      );
    }
    if (item.state === 'discarded') {
      return (
        <Space direction="vertical" size={0}>
          <Tag>{t(`devices:inbox.reasons.${item.discardReason ?? 'other'}`)}</Tag>
          {item.discardNote && <Text type="secondary">{item.discardNote}</Text>}
        </Space>
      );
    }
    if (item.status === 'failed') return null;
    const kind = matchKind(item);
    return (
      <Space direction="vertical" size={2}>
        <Tag color={MATCH_COLORS[kind]}>{t(`devices:inbox.match.${kind}`)}</Tag>
        {kind !== 'none' && kind !== 'ambiguous' && item.matchedPatientName && (
          <span data-testid="matched-patient">{item.matchedPatientName}</span>
        )}
      </Space>
    );
  };

  const actionsCell = (item: LabInboxItem) => (
    <Space wrap>
      {item.state === 'waiting' && item.status === 'ok' && (
        <Button size="small" type="primary" loading={opening === item.fileId} onClick={() => handleAttach(item)}>
          {t('devices:inbox.attach')}
        </Button>
      )}
      {item.state === 'waiting' && (
        <Button size="small" onClick={() => setDiscarding(item)}>
          {t('devices:inbox.discard')}
        </Button>
      )}
      {item.state === 'discarded' && (
        <Button size="small" loading={restoreMutation.isPending && restoreMutation.variables === item.fileId} onClick={() => handleRestore(item)}>
          {t('devices:inbox.restore')}
        </Button>
      )}
      {item.state === 'attached' && item.attachmentId && (
        <Button size="small" onClick={() => setMoving(item)}>
          {t('devices:inbox.move')}
        </Button>
      )}
    </Space>
  );

  const columns = [
    {
      title: t('devices:inbox.columns.received'),
      key: 'receivedAt',
      width: 150,
      render: (_: unknown, item: LabInboxItem) => (
        <Space direction="vertical" size={0}>
          <Text>{formatDateTime(item.receivedAt)}</Text>
          {isOverdue(item) && <Tag color="red">{t('devices:inbox.overdue')}</Tag>}
          {item.clockAhead && (
            <Tooltip title={t('devices:inbox.clockAheadHint')}>
              <Tag color="orange">{t('devices:inbox.clockAhead', { time: formatDateTime(item.machineTime) })}</Tag>
            </Tooltip>
          )}
          {item.damaged && (
            <Tooltip title={t('devices:inbox.damagedHint')}>
              <Tag color="red">{t('devices:inbox.damaged')}</Tag>
            </Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: t('devices:inbox.columns.machine'),
      key: 'machine',
      width: 160,
      render: (_: unknown, item: LabInboxItem) => (
        <Space direction="vertical" size={0}>
          <Text strong>{item.deviceName}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>{item.originalName}</Text>
        </Space>
      ),
    },
    {
      title: t('devices:inbox.columns.machineId'),
      key: 'machineId',
      width: 160,
      render: (_: unknown, item: LabInboxItem) =>
        item.status === 'failed' ? (
          <Space direction="vertical" size={0}>
            <Tag color="red">{t('devices:recentFiles.couldNotRead')}</Tag>
            <LabFailure error={item.error} />
          </Space>
        ) : item.machinePatientId ? (
          <Text code>{item.machinePatientId}</Text>
        ) : (
          <Text type="secondary">{t('devices:inbox.noMachineId')}</Text>
        ),
    },
    {
      title: t(`devices:inbox.columns.patient.${state}`),
      key: 'patient',
      width: 190,
      render: (_: unknown, item: LabInboxItem) => patientCell(item),
    },
    {
      title: t('devices:inbox.columns.values'),
      key: 'values',
      render: (_: unknown, item: LabInboxItem) => <LabValues values={item.values} />,
    },
    {
      title: t('common:actionsLabel'),
      key: 'actions',
      width: 200,
      render: (_: unknown, item: LabInboxItem) => actionsCell(item),
    },
  ];

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <Segmented
        value={state}
        onChange={(v) => setState(v as LabInboxState)}
        options={STATES.map((s) => ({ value: s, label: t(`devices:inbox.filter.${s}`) }))}
      />
      {isError ? (
        <LoadError title={t('devices:inbox.loadFailed')} onRetry={() => refetch()} retrying={isFetching} />
      ) : (
        <Table
          rowKey="fileId"
          size="small"
          loading={isLoading}
          dataSource={items ?? []}
          columns={columns}
          pagination={{ pageSize: 20, hideOnSinglePage: true }}
          locale={{ emptyText: t(`devices:inbox.empty.${state}`) }}
          onRow={(item: LabInboxItem) =>
            ({
              'data-overdue': isOverdue(item) ? 'true' : undefined,
              style: isOverdue(item) ? { background: 'var(--ant-color-error-bg, #fff1f0)' } : undefined,
            }) as React.HTMLAttributes<HTMLElement>
          }
          scroll={{ x: 900 }}
        />
      )}

      <DiscardDialog
        item={discarding}
        onClose={() => setDiscarding(null)}
        onDiscard={async (reason, note) => {
          if (!discarding) return;
          await discardMutation.mutateAsync({ fileId: discarding.fileId, reason, note });
          message.success(t('devices:inbox.discarded'));
          setDiscarding(null);
        }}
      />
      <MoveLabResultModal
        open={!!moving}
        attachmentId={moving?.attachmentId ?? undefined}
        fileName={moving?.originalName}
        currentPatientId={moving?.attachedPatientId ?? undefined}
        onClose={() => setMoving(null)}
      />
    </Space>
  );
};

interface DiscardDialogProps {
  item: LabInboxItem | null;
  onClose: () => void;
  onDiscard: (reason: DiscardReason, note?: string) => Promise<void>;
}

const DiscardDialog: React.FC<DiscardDialogProps> = ({ item, onClose, onDiscard }) => {
  const { t } = useTranslation(['devices', 'common']);
  const [reason, setReason] = useState<DiscardReason | undefined>();
  const [note, setNote] = useState('');
  const [missingReason, setMissingReason] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setReason(undefined);
    setNote('');
    setMissingReason(false);
    setError(null);
  };

  const submit = async () => {
    if (!reason) {
      setMissingReason(true);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onDiscard(reason, note.trim() || undefined);
      reset();
    } catch (e) {
      setError(errorText(e, t));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={!!item}
      title={t('devices:inbox.discardTitle')}
      okText={t('devices:inbox.discardConfirm')}
      okButtonProps={{ danger: true, loading: saving }}
      cancelText={t('common:buttons.cancel')}
      onOk={submit}
      onCancel={() => {
        reset();
        onClose();
      }}
      destroyOnHidden
    >
      <Form layout="vertical">
        <Form.Item
          label={t('devices:inbox.reason')}
          validateStatus={missingReason ? 'error' : undefined}
          help={missingReason ? t('devices:inbox.reasonRequired') : undefined}
        >
          <Radio.Group
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setMissingReason(false);
            }}
          >
            <Space direction="vertical">
              {REASONS.map((r) => (
                <Radio key={r} value={r}>
                  {t(`devices:inbox.reasons.${r}`)}
                </Radio>
              ))}
            </Space>
          </Radio.Group>
        </Form.Item>
        <Form.Item label={t('devices:inbox.note')}>
          <Input.TextArea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </Form.Item>
      </Form>
      {error && <Alert type="error" showIcon message={t('devices:inbox.discardFailed')} description={error} />}
    </Modal>
  );
};


/** Why a result could not be read; the raw cause is on hover for support. */
const LabFailure: React.FC<{ error?: string | null }> = ({ error }) => {
  const { t } = useTranslation(['devices']);
  const failure = labFailureText(error, t);
  if (!failure) return null;
  return (
    <Tooltip title={`${t('devices:inbox.failure.detail')}: ${failure.detail}`}>
      <Text type="secondary" style={{ fontSize: 12 }}>{failure.text}</Text>
    </Tooltip>
  );
};
export default LabInboxList;
