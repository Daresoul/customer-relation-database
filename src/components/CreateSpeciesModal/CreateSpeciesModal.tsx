import React, { useEffect } from 'react';
import { Modal, Form, Input, App } from 'antd';
import { useTranslation } from 'react-i18next';
import { useCreateSpecies } from '../../hooks/useSpecies';
import { toTitleCase } from '../../utils/stringUtils';
import type { Species } from '../../types/species';

interface CreateSpeciesModalProps {
  open: boolean;
  initialName?: string;
  onClose: () => void;
  /** Called with the new species, so callers needn't look it up in a list that may be stale. */
  onSuccess: (speciesName: string, created: Species) => void;
}

export const CreateSpeciesModal: React.FC<CreateSpeciesModalProps> = ({
  open,
  initialName,
  onClose,
  onSuccess,
}) => {
  const [form] = Form.useForm();
  const { t } = useTranslation(['settings', 'common']);
  const { notification } = App.useApp();
  const createSpecies = useCreateSpecies();

  useEffect(() => {
    if (open && initialName) {
      form.setFieldsValue({ name: initialName });
    }
  }, [open, initialName, form]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const titleCasedName = toTitleCase(values.name.trim());
      const created = await createSpecies.mutateAsync({ name: titleCasedName });
      notification.success({
        message: t('common:success'),
        description: t('settings:species.createdNamed', { name: titleCasedName }),
        placement: 'bottomRight',
        duration: 3,
      });
      onSuccess(titleCasedName, created);
      form.resetFields();
      onClose();
    } catch (error) {
      console.error('Failed to create species:', error);
      notification.error({
        message: t('common:error'),
        description: t('settings:species.createFailed'),
        placement: 'bottomRight',
        duration: 5,
      });
    }
  };

  const handleCancel = () => {
    form.resetFields();
    onClose();
  };

  return (
    <Modal
      title={t('settings:species.createTitle')}
      open={open}
      onOk={handleSubmit}
      onCancel={handleCancel}
      confirmLoading={createSpecies.isPending}
      okText={t('common:create')}
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="name"
          label={t('settings:species.nameColumn')}
          rules={[
            { required: true, message: t('settings:species.nameRequired') },
            { max: 50, message: t('settings:species.nameMaxLength', { max: 50 }) },
          ]}
        >
          <Input placeholder={t('settings:species.namePlaceholder')} autoFocus />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default CreateSpeciesModal;
