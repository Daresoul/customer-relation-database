import React, { useEffect } from 'react';
import { Modal, Form, Input, Select, App } from 'antd';
import { useCreateBreed } from '../../hooks/useBreeds';
import { useTranslation } from 'react-i18next';
import { useSpecies } from '../../hooks/useSpecies';
import { toTitleCase } from '../../utils/stringUtils';

interface CreateBreedModalProps {
  open: boolean;
  initialName?: string;
  speciesId?: number;
  onClose: () => void;
  onSuccess: (breedName: string) => void;
}

export const CreateBreedModal: React.FC<CreateBreedModalProps> = ({
  open,
  initialName,
  speciesId,
  onClose,
  onSuccess,
}) => {
  const [form] = Form.useForm();
  const { t } = useTranslation(['settings','forms','entities','common']);
  const { notification } = App.useApp();
  const createBreed = useCreateBreed();
  const { data: speciesList = [], isLoading: isLoadingSpecies } = useSpecies(true);

  useEffect(() => {
    if (open) {
      const initialValues: any = {};
      if (initialName) {
        initialValues.name = initialName;
      }
      if (speciesId) {
        initialValues.speciesId = speciesId;
      }
      form.setFieldsValue(initialValues);
    }
  }, [open, initialName, speciesId, form]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const titleCasedName = toTitleCase(values.name.trim());

      await createBreed.mutateAsync({
        name: titleCasedName,
        speciesId: values.speciesId,
      });

      notification.success({
        message: t('common:success'),
        description: t('settings:breeds.created', { name: titleCasedName }),
        placement: 'bottomRight',
        duration: 3,
      });

      onSuccess(titleCasedName);
      form.resetFields();
      onClose();
    } catch (error) {
      console.error('Failed to create breed:', error);
      notification.error({
        message: t('common:error'),
        description: t('settings:breeds.createFailed'),
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
      title={t('settings:breeds.addBreed')}
      open={open}
      onOk={handleSubmit}
      onCancel={handleCancel}
      confirmLoading={createBreed.isPending}
      okText={t('common:create')}
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="speciesId"
          label={t('entities:species')}
          rules={[{ required: true, message: t('forms:validation.required') }]}
        >
          <Select
            placeholder={t('settings:breeds.selectSpecies')}
            loading={isLoadingSpecies}
            options={speciesList.map(species => ({
              value: species.id,
              label: species.name,
            }))}
          />
        </Form.Item>

        <Form.Item
          name="name"
          label={t('entities:breed')}
          rules={[
            { required: true, message: t('forms:validation.required') },
            { max: 50, message: t('forms:validation.maxLength', { max: 50 }) },
          ]}
        >
          <Input placeholder={t('settings:breeds.breedPlaceholder')} autoFocus />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default CreateBreedModal;
