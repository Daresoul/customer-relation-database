import React, { useState } from 'react';
import { Card, Form, Input, Button, Table, Space, Modal, Popconfirm, Switch } from 'antd';
import { AppstoreOutlined, PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import styles from '../Settings.module.css';
import { useSpecies, useCreateSpecies, useUpdateSpecies, useDeleteSpecies } from '../../../hooks/useSpecies';
import { Species, CreateSpeciesInput, UpdateSpeciesInput } from '../../../types/species';

interface SpeciesSettingsProps {
  isUpdating: boolean;
}

const SpeciesSettings: React.FC<SpeciesSettingsProps> = ({ isUpdating }) => {
  const { t } = useTranslation(['common', 'forms', 'settings']);
  const [speciesModalVisible, setSpeciesModalVisible] = useState(false);
  const [editingSpecies, setEditingSpecies] = useState<Species | null>(null);
  const [speciesForm] = Form.useForm();

  // Fetch species data from database (show both active and inactive for settings management)
  const { data: speciesList = [], isLoading, refetch } = useSpecies(false);

  const createSpeciesMutation = useCreateSpecies();
  const updateSpeciesMutation = useUpdateSpecies();
  const deleteSpeciesMutation = useDeleteSpecies();

  const handleAddSpecies = () => {
    setEditingSpecies(null);
    speciesForm.resetFields();
    setSpeciesModalVisible(true);
  };

  const handleEditSpecies = (species: Species) => {
    setEditingSpecies(species);
    speciesForm.setFieldsValue({
      name: species.name,
      active: species.active,
    });
    setSpeciesModalVisible(true);
  };

  const handleToggleActive = async (species: Species) => {
    try {
      await updateSpeciesMutation.mutateAsync({
        id: species.id,
        data: { active: !species.active },
      });
      refetch();
    } catch (error) {
      console.error('Toggle species active error:', error);
    }
  };

  const handleSpeciesSubmit = async (values: any) => {
    try {
      const speciesData = {
        name: values.name,
        active: values.active !== undefined ? values.active : true,
      };

      if (editingSpecies) {
        await updateSpeciesMutation.mutateAsync({
          id: editingSpecies.id,
          data: speciesData as UpdateSpeciesInput,
        });
      } else {
        await createSpeciesMutation.mutateAsync(speciesData as CreateSpeciesInput);
      }

      setSpeciesModalVisible(false);
      speciesForm.resetFields();
      setEditingSpecies(null);
      refetch();
    } catch (error) {
      console.error('Save species error:', error);
    }
  };

  const handleDeleteSpecies = async (id: number) => {
    try {
      await deleteSpeciesMutation.mutateAsync({ id, hardDelete: false });
      refetch();
    } catch (error) {
      console.error('Delete species error:', error);
    }
  };

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: Species) => (
        <span className={record.active ? undefined : styles.roomNameInactive}>
          {text}
          {!record.active && ' (Inactive)'}
        </span>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'active',
      key: 'active',
      width: 100,
      render: (active: boolean, record: Species) => (
        <Switch
          checked={active}
          onChange={() => handleToggleActive(record)}
          loading={updateSpeciesMutation.isPending}
        />
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 150,
      render: (_: any, record: Species) => (
        <Space>
          <Button
            icon={<EditOutlined />}
            size="small"
            onClick={() => handleEditSpecies(record)}
          >
            Edit
          </Button>
          <Popconfirm
            title="Are you sure you want to delete this species?"
            description="This will only deactivate it if patients are using it."
            onConfirm={() => handleDeleteSpecies(record.id)}
            okText={t('common:yes')}
            cancelText={t('common:no')}
          >
            <Button
              icon={<DeleteOutlined />}
              size="small"
              danger
              loading={deleteSpeciesMutation.isPending}
            >
              Delete
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Card
        title={
          <span className={styles.cardTitle}>
            <AppstoreOutlined /> Species Management
          </span>
        }
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleAddSpecies}
          >
            Add Species
          </Button>
        }
        className={styles.roomsCard}
      >
        <Table
          columns={columns}
          dataSource={speciesList}
          rowKey="id"
          pagination={false}
          size="middle"
          loading={isLoading}
        />
      </Card>

      {/* Add/Edit Species Modal */}
      <Modal
        title={editingSpecies ? 'Edit Species' : 'Add New Species'}
        open={speciesModalVisible}
        onCancel={() => {
          setSpeciesModalVisible(false);
          speciesForm.resetFields();
          setEditingSpecies(null);
        }}
        onOk={() => speciesForm.submit()}
        confirmLoading={createSpeciesMutation.isPending || updateSpeciesMutation.isPending}
      >
        <Form
          form={speciesForm}
          layout="vertical"
          onFinish={handleSpeciesSubmit}
          key={editingSpecies?.id || 'new'}
        >
          <Form.Item
            name="name"
            label="Species Name"
            rules={[{ required: true, message: 'Please enter species name' }]}
          >
            <Input placeholder="e.g., Dog, Cat, Bird" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default SpeciesSettings;
