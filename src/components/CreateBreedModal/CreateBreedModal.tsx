import React, { useEffect } from 'react';
import { Modal, Form, Input, Select, App } from 'antd';
import { useCreateBreed } from '../../hooks/useBreeds';
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
        initialValues.species_id = speciesId;
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
        species_id: values.species_id,
      });

      notification.success({
        message: 'Success',
        description: `Breed "${titleCasedName}" created successfully`,
        placement: 'bottomRight',
        duration: 3,
      });

      onSuccess(titleCasedName);
      form.resetFields();
      onClose();
    } catch (error) {
      console.error('Failed to create breed:', error);
      notification.error({
        message: 'Error',
        description: 'Failed to create breed',
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
      title="Create New Breed"
      open={open}
      onOk={handleSubmit}
      onCancel={handleCancel}
      confirmLoading={createBreed.isPending}
      okText="Create"
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="species_id"
          label="Species"
          rules={[{ required: true, message: 'Please select species' }]}
        >
          <Select
            placeholder="Select species"
            loading={isLoadingSpecies}
            options={speciesList.map(species => ({
              value: species.id,
              label: species.name,
            }))}
          />
        </Form.Item>

        <Form.Item
          name="name"
          label="Breed Name"
          rules={[
            { required: true, message: 'Please enter breed name' },
            { max: 50, message: 'Name cannot exceed 50 characters' },
          ]}
        >
          <Input placeholder="Enter breed name" autoFocus />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default CreateBreedModal;
