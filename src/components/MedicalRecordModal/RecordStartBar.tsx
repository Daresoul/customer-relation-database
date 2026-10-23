import React, { useState } from 'react';
import { App, Button, Checkbox, Modal, Select, Space, Tag, Typography } from 'antd';
import { CopyOutlined, FileTextOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { invoke } from '@/services/invoke';
import { useRecordTemplates } from '@/hooks/useRecordTemplates';
import type { LastRecordCopy, RecordTemplate, RecordType } from '@/types/medical';
import type { MedicalRecordLineItem } from '@/types/lineItem';

const { Text, Paragraph } = Typography;

/** What a template or the last record fills into the form. */
export interface RecordPrefill {
  recordType?: RecordType;
  name?: string;
  description?: string;
  prescriptionNotes?: string | null;
  lineItems?: MedicalRecordLineItem[];
  diagnosisIds?: number[];
}

interface RecordStartBarProps {
  /** Copy from last record is for a new record only. */
  isEdit: boolean;
  patientId: number;
  onPrefill: (prefill: RecordPrefill) => void;
}

const TYPE_COLOR: Record<RecordType, string> = { procedure: 'blue', note: 'green', test_result: 'purple' };
const TYPE_LABEL: Record<RecordType, string> = {
  procedure: 'medical:recordTypes.procedure',
  note: 'medical:recordTypes.note',
  test_result: 'medical:recordTypes.testResult',
};

/** A template's price-list lines as record lines; a removed price-list item is left out. */
function templateLines(template: RecordTemplate): { lines: MedicalRecordLineItem[]; skipped: number } {
  const all = template.lineItems ?? [];
  const lines = all
    .filter((l) => l.isActive)
    .map((l) => ({
      templateId: l.lineItemTemplateId,
      name: l.name,
      description: l.description ?? undefined,
      unitPrice: l.unitPrice,
      currencyId: l.currencyId,
      quantity: l.quantity,
      taxRateId: l.taxRateId ?? null,
      vatName: l.vatName ?? null,
      vatPercent: l.vatPercent ?? null,
    }));
  return { lines, skipped: all.length - lines.length };
}

/** The old record's lines as new ones: same item, price, quantity and VAT rate, no ids. */
function copiedLines(items: MedicalRecordLineItem[]): MedicalRecordLineItem[] {
  return items.map((l) => ({
    templateId: l.templateId ?? undefined,
    name: l.name,
    description: l.description ?? undefined,
    unitPrice: l.unitPrice,
    currencyId: l.currencyId,
    quantity: l.quantity,
    taxRateId: l.taxRateId ?? null,
    vatName: l.vatName ?? null,
    vatPercent: l.vatPercent ?? null,
  }));
}

/**
 * "Start from" row above the record form: a searchable template picker that
 * lists every template on open, and (new records only) Copy from last record.
 */
const RecordStartBar: React.FC<RecordStartBarProps> = ({ isEdit, patientId, onPrefill }) => {
  const { t } = useTranslation(['medical', 'common']);
  const { notification, message } = App.useApp();
  const { data: templates = [], isLoading } = useRecordTemplates();
  const [copySource, setCopySource] = useState<LastRecordCopy | null>(null);
  const [copyLines, setCopyLines] = useState(false);
  const [loadingLast, setLoadingLast] = useState(false);

  const pickTemplate = (id: number) => {
    const template = templates.find((tpl) => tpl.id === id);
    if (!template) return;
    const { lines, skipped } = templateLines(template);
    if (skipped > 0) {
      notification.warning({
        message: t('medical:templatePicker.inactiveSkipped', { count: skipped }),
        placement: 'bottomRight',
        duration: 6,
      });
    }
    onPrefill({
      recordType: template.recordType,
      name: template.title,
      description: template.description,
      prescriptionNotes: template.prescriptionNotes,
      lineItems: lines,
      diagnosisIds: template.diagnosisIds ?? [],
    });
  };

  const openCopy = async () => {
    setLoadingLast(true);
    try {
      const last = await invoke<LastRecordCopy | null>('get_last_record_for_copy', { patientId });
      if (!last) {
        message.info(t('medical:copyLast.none'));
        return;
      }
      setCopyLines(false);
      setCopySource(last);
    } catch (e) {
      notification.error({
        message: t('medical:copyLast.loadFailed'),
        description: typeof e === 'string' ? e : (e as Error)?.message,
        placement: 'bottomRight',
      });
    } finally {
      setLoadingLast(false);
    }
  };

  const confirmCopy = () => {
    if (!copySource) return;
    onPrefill({
      description: copySource.description,
      prescriptionNotes: copySource.prescriptionNotes,
      diagnosisIds: copySource.diagnosisIds,
      lineItems: copyLines ? copiedLines(copySource.lineItems) : [],
    });
    setCopySource(null);
  };

  const options = templates.map((tpl) => ({
    value: tpl.id,
    search: `${tpl.title} ${tpl.description}`.toLowerCase(),
    label: (
      <Space size={6}>
        <span>{tpl.title}</span>
        <Tag color={TYPE_COLOR[tpl.recordType]} bordered={false}>
          {t(TYPE_LABEL[tpl.recordType])}
        </Tag>
      </Space>
    ),
  }));

  return (
    <Space wrap style={{ marginBottom: 12, width: '100%' }}>
      <Select<number>
        data-testid="record-template-picker"
        showSearch
        value={null}
        loading={isLoading}
        virtual={false}
        style={{ minWidth: 300 }}
        suffixIcon={<FileTextOutlined />}
        placeholder={t('medical:templatePicker.placeholder')}
        aria-label={t('medical:templatePicker.placeholder')}
        options={options}
        filterOption={(input, option) => (option?.search ?? '').includes(input.trim().toLowerCase())}
        notFoundContent={t('medical:templatePicker.empty')}
        onSelect={(id: number) => pickTemplate(id)}
      />
      {!isEdit && (
        <Button icon={<CopyOutlined />} loading={loadingLast} onClick={openCopy}>
          {t('medical:copyLast.button')}
        </Button>
      )}

      <Modal
        open={!!copySource}
        title={t('medical:copyLast.title')}
        okText={t('medical:copyLast.copy')}
        cancelText={t('common:buttons.cancel')}
        onOk={confirmCopy}
        onCancel={() => setCopySource(null)}
        destroyOnHidden
      >
        {copySource && (
          <>
            <Paragraph>
              {t('medical:copyLast.from', {
                name: copySource.name,
                date: dayjs(copySource.createdAt).isValid() ? dayjs(copySource.createdAt).format('DD.MM.YYYY') : '',
              })}
            </Paragraph>
            <Paragraph>{t('medical:copyLast.fills')}</Paragraph>
            {copySource.lineItems.length > 0 && (
              <Checkbox checked={copyLines} onChange={(e) => setCopyLines(e.target.checked)}>
                {t('medical:copyLast.withLines', { count: copySource.lineItems.length })}
              </Checkbox>
            )}
            <Paragraph style={{ marginTop: 12 }}>
              <Text type="secondary">{t('medical:copyLast.never')}</Text>
            </Paragraph>
          </>
        )}
      </Modal>
    </Space>
  );
};

export default RecordStartBar;
