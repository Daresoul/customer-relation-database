import React, { useEffect } from 'react';
import { Modal, Form, Input, App } from 'antd';
import { useCreateSpecies } from '../../hooks/useSpecies';
import { toTitleCase } from '../../utils/stringUtils';

interface CreateSpeciesModalProps {
  open: boolean;
  initialName?: string;
  onClose: () => void;
  onSuccess: (speciesName: string) => void;
}

export const CreateSpeciesModal: React.FC<CreateSpeciesModalProps> = ({
  open,
  initialName,
  onClose,
  onSuccess,
}) => {
  const [form] = Form.useForm();
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
      await createSpecies.mutateAsync({ name: titleCasedName });
      notification.success({
        message: 'Success',
        description: `Species "${titleCasedName}" created successfully`,
        placement: 'bottomRight',
        duration: 3,
      });
      onSuccess(titleCasedName);
      form.resetFields();
      onClose();
    } catch (error) {
      console.error('Failed to create species:', error);
      notification.error({
        message: 'Error',
        description: 'Failed to create species',
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
      title="Create New Species"
      open={open}
      onOk={handleSubmit}
      onCancel={handleCancel}
      confirmLoading={createSpecies.isPending}
      okText="Create"
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="name"
          label="Species Name"
          rules={[
            { required: true, message: 'Please enter species name' },
            { max: 50, message: 'Name cannot exceed 50 characters' },
          ]}
        >
          <Input placeholder="Enter species name" autoFocus />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default CreateSpeciesModal;
