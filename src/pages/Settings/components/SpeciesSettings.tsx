import React, { useState } from 'react';
import { Card, Form, Input, Button, Table, Space, Modal, Popconfirm, Switch, ColorPicker } from 'antd';
import { AppstoreOutlined, PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import type { Color } from 'antd/es/color-picker';
import { useTranslation } from 'react-i18next';
import styles from '../Settings.module.css';
import { useSpecies, useCreateSpecies, useUpdateSpecies, useDeleteSpecies } from '../../../hooks/useSpecies';
import { useBreeds, useCreateBreed, useUpdateBreed, useDeleteBreed } from '../../../hooks/useBreeds';
import { Species, CreateSpeciesInput, UpdateSpeciesInput } from '../../../types/species';
import { Breed, CreateBreedInput, UpdateBreedInput } from '../../../types/breed';
import { toTitleCase } from '../../../utils/stringUtils';

interface SpeciesSettingsProps {
  isUpdating: boolean;
}

const SpeciesSettings: React.FC<SpeciesSettingsProps> = ({ isUpdating }) => {
  const { t } = useTranslation(['common', 'forms', 'settings']);
  const [speciesModalVisible, setSpeciesModalVisible] = useState(false);
  const [editingSpecies, setEditingSpecies] = useState<Species | null>(null);
  const [speciesForm] = Form.useForm();

  // Breed modal state
  const [breedModalVisible, setBreedModalVisible] = useState(false);
  const [editingBreed, setEditingBreed] = useState<Breed | null>(null);
  const [selectedSpeciesForBreed, setSelectedSpeciesForBreed] = useState<number | null>(null);
  const [breedForm] = Form.useForm();

  // Track expanded rows
  const [expandedRowKeys, setExpandedRowKeys] = useState<number[]>([]);

  // Fetch species data from database (show both active and inactive for settings management)
  const { data: speciesList = [], isLoading, refetch } = useSpecies(false);

  // Fetch all breeds (we'll filter by species in the expanded row)
  const { data: allBreeds = [], refetch: refetchBreeds } = useBreeds(undefined, false);

  const createSpeciesMutation = useCreateSpecies();
  const updateSpeciesMutation = useUpdateSpecies();
  const deleteSpeciesMutation = useDeleteSpecies();

  const createBreedMutation = useCreateBreed();
  const updateBreedMutation = useUpdateBreed();
  const deleteBreedMutation = useDeleteBreed();

  const handleAddSpecies = () => {
    setEditingSpecies(null);
    speciesForm.resetFields();
    setSpeciesModalVisible(true);
  };

  const handleEditSpecies = (species: Species) => {
    setEditingSpecies(species);
    speciesForm.setFieldsValue({
      name: species.name,
      color: species.color,
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
      // Convert ColorPicker value to hex string
      const colorValue = typeof values.color === 'string'
        ? values.color
        : values.color?.toHexString?.() || '#1890ff';

      const speciesData = {
        name: toTitleCase(values.name.trim()),
        color: colorValue,
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

  // Breed handlers
  const handleAddBreed = (speciesId: number) => {
    setEditingBreed(null);
    setSelectedSpeciesForBreed(speciesId);
    breedForm.resetFields();
    breedForm.setFieldsValue({ species_id: speciesId });
    setBreedModalVisible(true);
  };

  const handleEditBreed = (breed: Breed) => {
    setEditingBreed(breed);
    setSelectedSpeciesForBreed(breed.species_id);
    breedForm.setFieldsValue({
      name: breed.name,
      species_id: breed.species_id,
      active: breed.active,
    });
    setBreedModalVisible(true);
  };

  const handleToggleBreedActive = async (breed: Breed) => {
    try {
      await updateBreedMutation.mutateAsync({
        id: breed.id,
        data: { active: !breed.active },
      });
      refetchBreeds();
    } catch (error) {
      console.error('Toggle breed active error:', error);
    }
  };

  const handleBreedSubmit = async (values: any) => {
    try {
      const breedData = {
        name: toTitleCase(values.name.trim()),
        species_id: values.species_id,
        active: values.active !== undefined ? values.active : true,
      };

      if (editingBreed) {
        await updateBreedMutation.mutateAsync({
          id: editingBreed.id,
          data: breedData as UpdateBreedInput,
        });
      } else {
        await createBreedMutation.mutateAsync(breedData as CreateBreedInput);
      }

      setBreedModalVisible(false);
      breedForm.resetFields();
      setEditingBreed(null);
      setSelectedSpeciesForBreed(null);
      refetchBreeds();
    } catch (error) {
      console.error('Save breed error:', error);
    }
  };

  const handleDeleteBreed = async (id: number) => {
    try {
      await deleteBreedMutation.mutateAsync({ id, hardDelete: false });
      refetchBreeds();
    } catch (error) {
      console.error('Delete breed error:', error);
    }
  };

  // Breed columns for expanded row
  const breedColumns = [
    {
      title: 'Breed Name',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: Breed) => (
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
      render: (active: boolean, record: Breed) => (
        <Switch
          checked={active}
          onChange={() => handleToggleBreedActive(record)}
          loading={updateBreedMutation.isPending}
        />
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 150,
      render: (_: any, record: Breed) => (
        <Space>
          <Button
            icon={<EditOutlined />}
            size="small"
            onClick={() => handleEditBreed(record)}
          >
            Edit
          </Button>
          <Popconfirm
            title="Are you sure you want to delete this breed?"
            description="This will only deactivate it if patients are using it."
            onConfirm={() => handleDeleteBreed(record.id)}
            okText={t('common:yes')}
            cancelText={t('common:no')}
          >
            <Button
              icon={<DeleteOutlined />}
              size="small"
              danger
              loading={deleteBreedMutation.isPending}
            >
              Delete
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const columns = [
    {
      title: 'Species Name',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: Species) => (
        <Space>
          <div
            style={{
              width: '16px',
              height: '16px',
              borderRadius: '50%',
              backgroundColor: record.color,
              display: 'inline-block',
            }}
          />
          <span className={record.active ? undefined : styles.roomNameInactive}>
            {text}
            {!record.active && ' (Inactive)'}
          </span>
        </Space>
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
      width: 250,
      render: (_: any, record: Species) => (
        <Space>
          <Button
            icon={<PlusOutlined />}
            size="small"
            onClick={() => handleAddBreed(record.id)}
          >
            Add Breed
          </Button>
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
          expandable={{
            expandedRowKeys,
            onExpandedRowsChange: (keys) => setExpandedRowKeys(keys as number[]),
            expandedRowRender: (species: Species) => {
              const speciesBreeds = allBreeds.filter(breed => breed.species_id === species.id);

              if (speciesBreeds.length === 0) {
                return (
                  <div style={{ padding: '16px', textAlign: 'center', color: '#999' }}>
                    No breeds added yet. Click "Add Breed" to create one.
                  </div>
                );
              }

              return (
                <Table
                  columns={breedColumns}
                  dataSource={speciesBreeds}
                  rowKey="id"
                  pagination={false}
                  size="small"
                  showHeader={true}
                />
              );
            },
            rowExpandable: () => true,
          }}
          onRow={(record) => ({
            onClick: (event) => {
              // Don't toggle if clicking on a button or switch
              const target = event.target as HTMLElement;
              if (
                target.closest('button') ||
                target.closest('.ant-switch') ||
                target.closest('.ant-popover')
              ) {
                return;
              }

              // Toggle expansion
              setExpandedRowKeys((prev) =>
                prev.includes(record.id)
                  ? prev.filter((key) => key !== record.id)
                  : [...prev, record.id]
              );
            },
            style: { cursor: 'pointer' },
          })}
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

          <Form.Item
            name="color"
            label="Color"
            rules={[{ required: true, message: 'Please select a color' }]}
          >
            <ColorPicker showText format="hex" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Add/Edit Breed Modal */}
      <Modal
        title={editingBreed ? 'Edit Breed' : 'Add New Breed'}
        open={breedModalVisible}
        onCancel={() => {
          setBreedModalVisible(false);
          breedForm.resetFields();
          setEditingBreed(null);
          setSelectedSpeciesForBreed(null);
        }}
        onOk={() => breedForm.submit()}
        confirmLoading={createBreedMutation.isPending || updateBreedMutation.isPending}
      >
        <Form
          form={breedForm}
          layout="vertical"
          onFinish={handleBreedSubmit}
          key={editingBreed?.id || 'new'}
        >
          <Form.Item label="Species">
            <Input
              disabled
              value={speciesList.find(s => s.id === selectedSpeciesForBreed)?.name || ''}
            />
          </Form.Item>

          <Form.Item
            name="species_id"
            hidden
            initialValue={selectedSpeciesForBreed}
          >
            <Input type="hidden" />
          </Form.Item>

          <Form.Item
            name="name"
            label="Breed Name"
            rules={[{ required: true, message: 'Please enter breed name' }]}
          >
            <Input placeholder="e.g., Golden Retriever, Persian" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default SpeciesSettings;
