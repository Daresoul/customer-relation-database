import React, { useState } from 'react';
import { Card, Form, Input, Button, Table, Space, Modal, Popconfirm, Switch, Select } from 'antd';
import { AppstoreOutlined, PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import styles from '../Settings.module.css';
import { useBreeds, useCreateBreed, useUpdateBreed, useDeleteBreed } from '../../../hooks/useBreeds';
import { useSpecies } from '../../../hooks/useSpecies';
import { Breed, CreateBreedInput, UpdateBreedInput } from '../../../types/breed';
import { toTitleCase } from '../../../utils/stringUtils';

interface BreedsSettingsProps {
  isUpdating: boolean;
}

const BreedsSettings: React.FC<BreedsSettingsProps> = ({ isUpdating }) => {
  const { t } = useTranslation(['common', 'forms', 'settings']);
  const [breedModalVisible, setBreedModalVisible] = useState(false);
  const [editingBreed, setEditingBreed] = useState<Breed | null>(null);
  const [breedForm] = Form.useForm();
  const [selectedSpeciesId, setSelectedSpeciesId] = useState<number | undefined>(undefined);

  // Fetch breeds and species data from database
  const { data: breedsList = [], isLoading, refetch } = useBreeds(selectedSpeciesId, false);
  const { data: speciesList = [], isLoading: isLoadingSpecies } = useSpecies(true);

  const createBreedMutation = useCreateBreed();
  const updateBreedMutation = useUpdateBreed();
  const deleteBreedMutation = useDeleteBreed();

  const handleAddBreed = () => {
    setEditingBreed(null);
    breedForm.resetFields();
    // Pre-select the species if filtered
    if (selectedSpeciesId) {
      breedForm.setFieldsValue({ speciesId: selectedSpeciesId });
    }
    setBreedModalVisible(true);
  };

  const handleEditBreed = (breed: Breed) => {
    setEditingBreed(breed);
    breedForm.setFieldsValue({
      name: breed.name,
      speciesId: breed.speciesId,
      active: breed.active,
    });
    setBreedModalVisible(true);
  };

  const handleToggleActive = async (breed: Breed) => {
    try {
      await updateBreedMutation.mutateAsync({
        id: breed.id,
        data: { active: !breed.active },
      });
      refetch();
    } catch (error) {
      console.error('Toggle breed active error:', error);
    }
  };

  const handleBreedSubmit = async (values: any) => {
    try {
      const breedData = {
        name: toTitleCase(values.name.trim()),
        speciesId: values.speciesId,
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
      refetch();
    } catch (error) {
      console.error('Save breed error:', error);
    }
  };

  const handleDeleteBreed = async (id: number) => {
    try {
      await deleteBreedMutation.mutateAsync({ id, hardDelete: false });
      refetch();
    } catch (error) {
      console.error('Delete breed error:', error);
    }
  };

  const getSpeciesName = (speciesId: number) => {
    const species = speciesList.find(s => s.id === speciesId);
    return species?.name || 'Unknown';
  };

  const columns = [
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
      title: 'Species',
      dataIndex: 'speciesId',
      key: 'speciesId',
      render: (speciesId: number) => getSpeciesName(speciesId),
    },
    {
      title: 'Status',
      dataIndex: 'active',
      key: 'active',
      width: 100,
      render: (active: boolean, record: Breed) => (
        <Switch
          checked={active}
          onChange={() => handleToggleActive(record)}
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
            {t('common:edit')}
          </Button>
          <Popconfirm
            title={t('settings:breeds.confirmDeleteTitle', 'Are you sure you want to delete this breed?')}
            description={t('settings:breeds.confirmDeleteDescription', 'This will only deactivate it if patients are using it.')}
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
              {t('common:delete')}
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
            <AppstoreOutlined /> {t('settings:breeds.title')}
          </span>
        }
        extra={
          <Space>
            <Select
              placeholder={t('settings:breeds.filterBySpecies')}
              allowClear
              style={{ width: 200 }}
              onChange={setSelectedSpeciesId}
              value={selectedSpeciesId}
              loading={isLoadingSpecies}
              options={speciesList.map(species => ({
                value: species.id,
                label: species.name,
              }))}
            />
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleAddBreed}
            >
              {t('settings:breeds.addBreed')}
            </Button>
          </Space>
        }
        className={styles.roomsCard}
      >
        <Table
          columns={columns}
          dataSource={breedsList}
          rowKey="id"
          pagination={{ pageSize: 20 }}
          size="middle"
          loading={isLoading}
        />
      </Card>

      {/* Add/Edit Breed Modal */}
      <Modal
        title={editingBreed ? t('settings:breeds.editBreed') : t('settings:breeds.addBreed')}
        open={breedModalVisible}
        onCancel={() => {
          setBreedModalVisible(false);
          breedForm.resetFields();
          setEditingBreed(null);
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
            rules={[{ required: true, message: t('forms:validation.required') }]}
          >
            <Input placeholder={t('settings:breeds.breedPlaceholder')} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default BreedsSettings;
