import React, { useState } from 'react';
import { Card, Form, Input, Button, Table, Space, Modal, Popconfirm, InputNumber, Switch } from 'antd';
import { HomeOutlined, PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../../../utils/themeStyles';
import styles from '../Settings.module.css';
import { useRooms, useCreateRoom, useUpdateRoom, useDeleteRoom } from '../../../hooks/useRooms';
import { Room, CreateRoomInput, UpdateRoomInput } from '../../../types/rooms';

const { TextArea } = Input;


interface RoomsSettingsProps {
  isUpdating: boolean;
}

const RoomsSettings: React.FC<RoomsSettingsProps> = ({ isUpdating }) => {
  const { t } = useTranslation(['common', 'forms', 'settings']);
  const themeColors = useThemeColors();
  const [roomModalVisible, setRoomModalVisible] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [roomForm] = Form.useForm();

  // Fetch rooms data from database (show both active and inactive for settings management)
  const { data: rooms = [], isLoading, refetch } = useRooms({ activeOnly: false });

  const createRoomMutation = useCreateRoom();
  const updateRoomMutation = useUpdateRoom();
  const deleteRoomMutation = useDeleteRoom();

  const handleAddRoom = () => {
    setEditingRoom(null);
    roomForm.resetFields();
    // Set default values for new room
    roomForm.setFieldsValue({
      capacity: 1,
      color: '#1890ff',
      isActive: true,
    });
    setRoomModalVisible(true);
  };

  const handleEditRoom = (room: Room) => {
    setEditingRoom(room);
    // Ensure all fields are set, including color
    const formValues = {
      name: room.name,
      description: room.description,
      capacity: room.capacity,
      color: room.color || '#1890ff',
      isActive: room.isActive,
    };
    roomForm.setFieldsValue(formValues);
    setRoomModalVisible(true);
  };

  const handleDeactivateRoom = async (roomId: number) => {
    try {
      await updateRoomMutation.mutateAsync({
        id: roomId,
        data: { isActive: false },
      });
      refetch();
    } catch (error) {
      console.error('Deactivate room error:', error);
    }
  };

  const handleRoomSubmit = async (values: any) => {
    try {
      const roomData = {
        name: values.name,
        description: values.description || null,
        capacity: values.capacity || 1,
        color: values.color || '#1890ff',
        isActive: values.isActive ?? editingRoom?.isActive ?? true,
      };

      if (editingRoom) {
        await updateRoomMutation.mutateAsync({
          id: editingRoom.id,
          data: roomData as UpdateRoomInput,
        });
      } else {
        await createRoomMutation.mutateAsync(roomData as CreateRoomInput);
      }

      setRoomModalVisible(false);
      roomForm.resetFields();
      setEditingRoom(null);
      refetch();
    } catch (error) {
      console.error('Save room error:', error);
    }
  };

  const columns = [
    {
      title: t('appointments:rooms.color'),
      dataIndex: 'color',
      key: 'color',
      width: 80,
      render: (color: string, record: Room) => (
        <div
          className={`${styles.roomColorBox} ${!record.isActive ? styles.roomColorInactive : ''}`}
          style={{
            backgroundColor: record.isActive ? color || '#1890ff' : '#d9d9d9'
          }}
          title={t('appointments:rooms.colorTooltip', { color: color || '#1890ff' })}
        />
      ),
    },
    {
      title: t('appointments:rooms.name'),
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: Room) => (
        <span className={record.isActive ? styles.roomNameActive : styles.roomNameInactive}>
          {text}
          {!record.isActive && ` (${t('common:inactive')})`}
        </span>
      ),
    },
    {
      title: t('appointments:fields.description'),
      dataIndex: 'description',
      key: 'description',
      render: (text: string) => text || '-',
    },
    {
      title: t('appointments:fields.capacity'),
      dataIndex: 'capacity',
      key: 'capacity',
    },
    {
      title: t('common:actionsLabel'),
      key: 'actions',
      render: (_: any, record: Room) => (
        <Space>
          <Button
            icon={<EditOutlined />}
            size="small"
            onClick={() => handleEditRoom(record)}
          >
            {t('common:edit')}
          </Button>
          {record.isActive && (
            <Popconfirm
              title={t('settings:rooms.confirmDelete')}
              onConfirm={() => handleDeactivateRoom(record.id)}
              okText={t('common:yes')}
              cancelText={t('common:no')}
            >
              <Button
                icon={<DeleteOutlined />}
                size="small"
                danger
                loading={updateRoomMutation.isPending}
              >
                {t('common:deactivate')}
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Card
        title={
          <span className={styles.cardTitle}>
            <HomeOutlined /> {t('appointments:rooms.title')}
          </span>
        }
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleAddRoom}
          >
            {t('appointments:rooms.add')}
          </Button>
        }
        className={styles.roomsCard}
      >
        <Table
          columns={columns}
          dataSource={rooms}
          rowKey="id"
          pagination={false}
          size="middle"
          loading={isLoading}
        />
      </Card>

      {/* Add/Edit Room Modal */}
      <Modal
        title={editingRoom ? t('appointments:rooms.edit') : t('appointments:rooms.addNew')}
        open={roomModalVisible}
        onCancel={() => {
          setRoomModalVisible(false);
          roomForm.resetFields();
          setEditingRoom(null);
        }}
        onOk={() => roomForm.submit()}
        confirmLoading={createRoomMutation.isPending || updateRoomMutation.isPending}
      >
        <Form scrollToFirstError={{ focus: true }}
          form={roomForm}
          layout="vertical"
          onFinish={handleRoomSubmit}
          key={editingRoom?.id || 'new'}
        >
          <Form.Item
            name="name"
            label={t('appointments:rooms.nameLabel')}
            rules={[{ required: true, whitespace: true, message: t('appointments:rooms.nameRequired') }]}
          >
            <Input placeholder={t('appointments:rooms.namePlaceholder')} />
          </Form.Item>

          <Form.Item
            name="description"
            label={t('appointments:fields.description')}
          >
            <TextArea
              rows={3}
              placeholder={t('appointments:rooms.descriptionPlaceholder')}
            />
          </Form.Item>

          <Form.Item
            name="capacity"
            label={t('appointments:fields.capacity')}
            rules={[{ required: true, message: t('appointments:rooms.capacityRequired') }]}
            initialValue={1}
          >
            <InputNumber
              min={1}
              max={100}
              placeholder={t('appointments:rooms.capacityPlaceholder')}
              className={styles.fullWidth}
            />
          </Form.Item>

          <Form.Item
            name="color"
            label={t('appointments:rooms.colorLabel')}
            extra={t('appointments:rooms.colorHint')}
          >
            <Input
              type="color"
              className={styles.colorPickerInput}
            />
          </Form.Item>

          <Form.Item name="isActive" label={t('common:active')} valuePropName="checked">
            <Switch aria-label={t('common:active')} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default RoomsSettings;