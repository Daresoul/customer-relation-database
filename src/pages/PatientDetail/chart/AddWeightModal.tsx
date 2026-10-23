import React, { useEffect, useState } from 'react';
import { DatePicker, Form, InputNumber, Modal } from 'antd';
import { useTranslation } from 'react-i18next';
import dayjs, { type Dayjs } from 'dayjs';
import { useAddWeight } from '../../../hooks/usePatientChart';
import { getDatePickerFormat } from '../../../utils/dateFormatter';
import { localeNumberParser } from '../../../utils/localeNumber';

interface AddWeightModalProps {
  open: boolean;
  patient: { id: number; name: string };
  onClose: () => void;
}

/** Appends a dated entry to the weight log; the patient's weight follows the newest. */
export const AddWeightModal: React.FC<AddWeightModalProps> = ({ open, patient, onClose }) => {
  const { t } = useTranslation(['patients', 'common']);
  const addWeight = useAddWeight();
  const [weight, setWeight] = useState<number | null>(null);
  const [date, setDate] = useState<Dayjs>(dayjs());

  useEffect(() => {
    if (open) {
      setWeight(null);
      setDate(dayjs());
    }
  }, [open]);

  const save = async () => {
    if (!weight || weight <= 0) return;
    try {
      await addWeight.mutateAsync({ patientId: patient.id, weight, measuredOn: date.format('YYYY-MM-DD') });
      onClose();
    } catch {
      // the hook explains the failure; the dialog stays open with the value
    }
  };

  return (
    <Modal
      open={open}
      title={t('patients:chart.weights.addTitle', { name: patient.name })}
      okText={t('common:save')}
      cancelText={t('common:cancel')}
      okButtonProps={{ disabled: !weight || weight <= 0 }}
      confirmLoading={addWeight.isPending}
      onOk={save}
      onCancel={onClose}
      destroyOnHidden
    >
      <Form layout="vertical" onFinish={save}>
        <Form.Item label={t('patients:chart.weights.weight')} required>
          <InputNumber
            autoFocus
            aria-label={t('patients:chart.weights.weight')}
            value={weight}
            onChange={(v) => setWeight(typeof v === 'number' ? v : null)}
            min={0.01}
            max={500}
            precision={2}
            parser={localeNumberParser}
            addonAfter={t('patients:units.kg')}
            style={{ width: '100%' }}
            onPressEnter={save}
          />
        </Form.Item>
        <Form.Item label={t('patients:chart.weights.date')} required>
          <DatePicker
            value={date}
            onChange={(d) => d && setDate(d)}
            allowClear={false}
            format={getDatePickerFormat()}
            disabledDate={(d) => d.isAfter(dayjs().endOf('day'))}
            style={{ width: '100%' }}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default AddWeightModal;
