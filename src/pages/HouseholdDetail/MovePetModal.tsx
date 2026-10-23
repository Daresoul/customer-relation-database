import React, { useRef, useState } from 'react';
import { Alert, App, Form, Modal, Select, Space, Spin, Typography } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useMovePatient } from '../../hooks/useHouseholdActions';
import { PatientService } from '../../services/patientService';
import { knownErrorMessage } from '@/utils/errors';
import type { HouseholdSearchResult } from '../../types/household';
import type { Patient } from '../../types/models';
import { HouseholdPicker } from './HouseholdPicker';

const { Text, Paragraph } = Typography;

function errorText(error: unknown, t: (k: string) => string): string {
  return knownErrorMessage(error, t as never) || String(error instanceof Error ? error.message : error);
}

export interface MovePetModalProps {
  pet: { id: number; name: string } | null;
  householdId: number;
  onClose: () => void;
}

/** Moves one pet from this household to another one picked by search. */
export const MovePetModal: React.FC<MovePetModalProps> = ({ pet, householdId, onClose }) => {
  const { t } = useTranslation('households');
  const { notification } = App.useApp();
  const move = useMovePatient();
  const [target, setTarget] = useState<HouseholdSearchResult | undefined>();
  const [failure, setFailure] = useState<string | null>(null);

  const close = () => {
    setTarget(undefined);
    setFailure(null);
    onClose();
  };

  const handleMove = async () => {
    if (!pet || !target) return;
    setFailure(null);
    try {
      await move.mutateAsync({ patientId: pet.id, householdId: target.id });
    } catch (error) {
      setFailure(errorText(error, t));
      return;
    }
    notification.success({
      message: t('detail.animals.move.success', { name: pet.name, household: target.householdName ?? '' }),
      placement: 'bottomRight',
      duration: 3,
    });
    close();
  };

  return (
    <Modal
      open={!!pet}
      title={t('detail.animals.move.title', { name: pet?.name ?? '' })}
      onCancel={close}
      onOk={handleMove}
      okText={t('detail.animals.move.confirm')}
      okButtonProps={{ disabled: !target }}
      confirmLoading={move.isPending}
      destroyOnHidden
    >
      <Form layout="vertical">
        <Form.Item label={t('detail.animals.move.pickLabel')}>
          <HouseholdPicker excludeId={householdId} autoFocus onChange={setTarget} />
        </Form.Item>
      </Form>
      {target && <Paragraph type="secondary">{t('detail.animals.move.confirmText', { name: pet?.name ?? '' })}</Paragraph>}
      {failure !== null && <Alert type="error" showIcon message={t('detail.animals.move.failed')} description={failure} />}
    </Modal>
  );
};

export interface LinkPetModalProps {
  open: boolean;
  householdId: number;
  onClose: () => void;
}

/** Brings an already-registered pet into this household. */
export const LinkPetModal: React.FC<LinkPetModalProps> = ({ open, householdId, onClose }) => {
  const { t } = useTranslation('households');
  const { notification } = App.useApp();
  const move = useMovePatient();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Patient[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const [picked, setPicked] = useState<Patient | undefined>();
  const [failure, setFailure] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const close = () => {
    setQuery('');
    setResults([]);
    setPicked(undefined);
    setFailure(null);
    onClose();
  };

  const onSearch = (value: string) => {
    setQuery(value);
    if (timer.current) clearTimeout(timer.current);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }
    timer.current = setTimeout(async () => {
      setSearching(true);
      setSearchFailed(false);
      try {
        const found = await PatientService.searchPatients(value.trim(), 20);
        setResults((found ?? []).filter((p) => p.householdId !== householdId));
      } catch {
        setResults([]);
        setSearchFailed(true);
      } finally {
        setSearching(false);
      }
    }, 250);
  };

  const handleLink = async () => {
    if (!picked) return;
    setFailure(null);
    try {
      await move.mutateAsync({ patientId: picked.id, householdId });
    } catch (error) {
      setFailure(errorText(error, t));
      return;
    }
    notification.success({
      message: t('detail.animals.link.success', { name: picked.name }),
      placement: 'bottomRight',
      duration: 3,
    });
    close();
  };

  return (
    <Modal
      open={open}
      title={t('detail.animals.link.title')}
      onCancel={close}
      onOk={handleLink}
      okText={t('detail.animals.link.confirm')}
      okButtonProps={{ disabled: !picked }}
      confirmLoading={move.isPending}
      destroyOnHidden
    >
      <Select
        showSearch
        autoFocus
        value={picked?.id}
        placeholder={t('detail.animals.link.searchPlaceholder')}
        suffixIcon={<SearchOutlined />}
        filterOption={false}
        onSearch={onSearch}
        onChange={(id: number) => setPicked(results.find((p) => p.id === id))}
        notFoundContent={
          searching ? (
            <Spin size="small" />
          ) : query.trim().length < 2 ? (
            t('picker.typeMore')
          ) : searchFailed ? (
            t('detail.animals.link.searchFailed')
          ) : (
            t('detail.animals.link.noMatches')
          )
        }
        style={{ width: '100%' }}
      >
        {results.map((p) => (
          <Select.Option key={p.id} value={p.id}>
            <Space size={6}>
              <Text strong>{p.name}</Text>
              {p.species && <Text type="secondary">{p.species}</Text>}
              {p.microchipId && <Text type="secondary">{p.microchipId}</Text>}
            </Space>
          </Select.Option>
        ))}
      </Select>
      {picked && (
        <Paragraph type="secondary" style={{ marginTop: 12 }}>
          {picked.householdId ? t('detail.animals.link.inOtherHousehold') : t('detail.animals.link.noHousehold')}
        </Paragraph>
      )}
      {failure !== null && <Alert type="error" showIcon message={t('detail.animals.link.failed')} description={failure} />}
    </Modal>
  );
};
