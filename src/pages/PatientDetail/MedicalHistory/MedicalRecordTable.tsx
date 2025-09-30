import React, { useState } from 'react';
import { Table, Tag, Space, Button, Tooltip, Popconfirm, message } from 'antd';
import {
  EditOutlined,
  DeleteOutlined,
  FileTextOutlined,
  PaperClipOutlined,
  HistoryOutlined,
  InboxOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import { useArchiveMedicalRecord } from '@/hooks/useMedicalRecords';
import { MedicalService } from '@/services/medicalService';
import type { MedicalRecord } from '@/types/medical';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { formatDate } from '@/utils/dateFormatter';
import { Link } from 'react-router-dom';
import styles from './MedicalHistory.module.css';

interface MedicalRecordTableProps {
  records: MedicalRecord[];
  onEdit: (recordId: number) => void;
  onRefresh: () => void;
  patientId: number;
}

const MedicalRecordTable: React.FC<MedicalRecordTableProps> = ({
  records,
  onEdit,
  onRefresh,
  patientId,
}) => {
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const archiveMutation = useArchiveMedicalRecord();

  const handleArchive = async (recordId: number, archive: boolean) => {
    try {
      await archiveMutation.mutateAsync({ recordId, archive });
      onRefresh();
    } catch (error) {
      console.error('Archive error:', error);
    }
  };

  const handleBulkArchive = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('Please select records to archive');
      return;
    }

    const promises = selectedRowKeys.map(id =>
      archiveMutation.mutateAsync({ recordId: Number(id), archive: true })
    );

    try {
      await Promise.all(promises);
      message.success(`${selectedRowKeys.length} records archived`);
      setSelectedRowKeys([]);
      onRefresh();
    } catch (error) {
      console.error('Bulk archive error:', error);
    }
  };

  const columns: ColumnsType<MedicalRecord> = [
    {
      title: 'Date',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 100,
      render: (date: string) => formatDate(date),
      sorter: (a, b) => dayjs(a.createdAt).unix() - dayjs(b.createdAt).unix(),
    },
    {
      title: 'Type',
      dataIndex: 'recordType',
      key: 'recordType',
      width: 100,
      render: (type: string) => (
        <Tag
          color={type === 'procedure' ? 'blue' : 'green'}
          icon={type === 'procedure' ? <FileTextOutlined /> : <UnorderedListOutlined />}
        >
          {type.charAt(0).toUpperCase() + type.slice(1)}
        </Tag>
      ),
      filters: [
        { text: 'Procedure', value: 'procedure' },
        { text: 'Note', value: 'note' },
      ],
      onFilter: (value, record) => record.recordType === value,
    },
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
      render: (name: string, record) => (
        <Space>
          <Link to={`/medical-records/${record.id}`} className={styles.inheritColor}>
            {name}
          </Link>
          {record.attachments && record.attachments.length > 0 && (
            <Tooltip title={`${record.attachments.length} attachment(s)`}>
              <PaperClipOutlined className={styles.attachmentIcon} />
            </Tooltip>
          )}
          {record.version > 1 && (
            <Tooltip title={`Modified (v${record.version})`}>
              <HistoryOutlined className={styles.historyIcon} />
            </Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: 'Procedure',
      dataIndex: 'procedureName',
      key: 'procedureName',
      ellipsis: true,
      render: (procedureName: string | undefined, record) => (
        <>
          {record.recordType === 'procedure' ? (
            <Link to={`/medical-records/${record.id}`} className={styles.inheritColor}>
              {record.name || '-'}
            </Link>
          ) : (
            (procedureName || '-')
          )}
        </>
      ),
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (text: string) => (
        <Tooltip title={text}>
          <span>{text.length > 100 ? text.substring(0, 100) + '...' : text}</span>
        </Tooltip>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 150,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="Edit">
            <Button
              type="text"
              icon={<EditOutlined />}
              onClick={() => onEdit(record.id)}
            />
          </Tooltip>
          {record.isArchived ? (
            <Tooltip title="Restore">
              <Button
                type="text"
                icon={<InboxOutlined />}
                onClick={() => handleArchive(record.id, false)}
              />
            </Tooltip>
          ) : (
            <Popconfirm
              title="Archive this record?"
              description="Archived records can be restored later."
              onConfirm={() => handleArchive(record.id, true)}
              okText="Archive"
              cancelText="Cancel"
            >
              <Tooltip title="Archive">
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                />
              </Tooltip>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const rowSelection = {
    selectedRowKeys,
    onChange: (newSelectedRowKeys: React.Key[]) => {
      setSelectedRowKeys(newSelectedRowKeys);
    },
  };

  return (
    <>
      {selectedRowKeys.length > 0 && (
        <div className={styles.marginBottom16}>
          <Space>
            <span>{selectedRowKeys.length} selected</span>
            <Button onClick={() => setSelectedRowKeys([])}>Clear</Button>
            <Popconfirm
              title={`Archive ${selectedRowKeys.length} records?`}
              description="These records can be restored later."
              onConfirm={handleBulkArchive}
              okText="Archive All"
              cancelText="Cancel"
            >
              <Button danger>Archive Selected</Button>
            </Popconfirm>
          </Space>
        </div>
      )}

      <Table
        rowSelection={rowSelection}
        columns={columns}
        dataSource={records}
        rowKey="id"
        pagination={{
          pageSize: 10,
          showSizeChanger: true,
          showTotal: (total) => `Total ${total} records`,
        }}
        scroll={{ x: 1000 }}
        size="small"
      />
    </>
  );
};

export default MedicalRecordTable;
