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
  const { data: rooms = [], isLoading, refetch } = useRooms({ active_only: false });

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
      is_active: true,
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
      is_active: room.is_active,
    };
    roomForm.setFieldsValue(formValues);
    setRoomModalVisible(true);
  };

  const handleDeactivateRoom = async (roomId: number) => {
    try {
      await updateRoomMutation.mutateAsync({
        id: roomId,
        data: { is_active: false },
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
        is_active: values.is_active !== undefined ? values.is_active : true,
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
      title: 'Color',
      dataIndex: 'color',
      key: 'color',
      width: 80,
      render: (color: string, record: Room) => (
        <div
          className={`${styles.roomColorBox} ${!record.is_active ? styles.roomColorInactive : ''}`}
          style={{
            backgroundColor: record.is_active ? color || '#1890ff' : '#d9d9d9'
          }}
          title={`Room color: ${color || '#1890ff'}`}
        />
      ),
    },
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: Room) => (
        <span className={record.is_active ? styles.roomNameActive : styles.roomNameInactive}>
          {text}
          {!record.is_active && ' (Inactive)'}
        </span>
      ),
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      render: (text: string) => text || '-',
    },
    {
      title: 'Capacity',
      dataIndex: 'capacity',
      key: 'capacity',
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: Room) => (
        <Space>
          <Button
            icon={<EditOutlined />}
            size="small"
            onClick={() => handleEditRoom(record)}
          >
            Edit
          </Button>
          {record.is_active && (
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
                Deactivate
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
            <HomeOutlined /> Appointment Rooms
          </span>
        }
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleAddRoom}
          >
            Add Room
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
        title={editingRoom ? 'Edit Room' : 'Add New Room'}
        open={roomModalVisible}
        onCancel={() => {
          setRoomModalVisible(false);
          roomForm.resetFields();
          setEditingRoom(null);
        }}
        onOk={() => roomForm.submit()}
        confirmLoading={createRoomMutation.isPending || updateRoomMutation.isPending}
      >
        <Form
          form={roomForm}
          layout="vertical"
          onFinish={handleRoomSubmit}
          key={editingRoom?.id || 'new'}
        >
          <Form.Item
            name="name"
            label="Room Name"
            rules={[{ required: true, message: 'Please enter room name' }]}
          >
            <Input placeholder="e.g., Examination Room 1" />
          </Form.Item>

          <Form.Item
            name="description"
            label="Description"
          >
            <TextArea
              rows={3}
              placeholder="Optional description of the room"
            />
          </Form.Item>

          <Form.Item
            name="capacity"
            label="Capacity"
            rules={[{ required: true, message: 'Please enter room capacity' }]}
            initialValue={1}
          >
            <InputNumber
              min={1}
              max={100}
              placeholder="Number of patients/animals"
              className={styles.fullWidth}
            />
          </Form.Item>

          <Form.Item
            name="color"
            label="Room Color"
            extra="This color will be used to identify the room in the calendar"
          >
            <Input
              type="color"
              className={styles.colorPickerInput}
            />
          </Form.Item>

        </Form>
      </Modal>
    </div>
  );
};

export default RoomsSettings;