import React, { useState } from 'react';
import { Card, Button, Space, Input, Select, Badge, Empty, Spin } from 'antd';
import { PlusOutlined, SearchOutlined, FilterOutlined } from '@ant-design/icons';
import { useMedicalRecords } from '@/hooks/useMedicalRecords';
import MedicalRecordCards from './MedicalRecordCards';
import MedicalRecordModal from '@/components/MedicalRecordModal/MedicalRecordModal';
import type { MedicalRecordFilter } from '@/types/medical';

const { Search } = Input;
const { Option } = Select;

interface MedicalHistorySectionProps {
  patientId: number;
  patientName: string;
  onNavigateToRecord?: (recordId: number) => void;
}

const MedicalHistorySection: React.FC<MedicalHistorySectionProps> = ({
  patientId,
  patientName,
  onNavigateToRecord,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRecordId, setSelectedRecordId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<MedicalRecordFilter>({
    isArchived: false,
  });

  const { data, isLoading, refetch } = useMedicalRecords(patientId, filter);

  const handleCreateNew = () => {
    setSelectedRecordId(null);
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedRecordId(null);
    refetch();
  };

  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setFilter(prev => ({
      ...prev,
      searchTerm: value || undefined,
    }));
  };

  const handleTypeFilter = (value: string) => {
    setFilter(prev => ({
      ...prev,
      recordType: value === 'all' ? undefined : value,
    }));
  };

  const handleArchiveFilter = (value: boolean) => {
    setFilter(prev => ({
      ...prev,
      isArchived: value,
    }));
  };


  return (
    <Card
      title="Medical History"
      extra={
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={handleCreateNew}
        >
          Add Record
        </Button>
      }
      style={{ marginTop: 16 }}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        {/* Search and Filters */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
          <Search
            placeholder="Search medical records..."
            prefix={<SearchOutlined />}
            allowClear
            enterButton="Search"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            onSearch={handleSearch}
            style={{ maxWidth: 400 }}
          />

          <Select
            defaultValue="all"
            style={{ width: 150 }}
            onChange={handleTypeFilter}
            suffixIcon={<FilterOutlined />}
          >
            <Option value="all">All Types</Option>
            <Option value="procedure">Procedures</Option>
            <Option value="note">Notes</Option>
          </Select>

          <Select
            defaultValue={false}
            style={{ width: 150 }}
            onChange={handleArchiveFilter}
          >
            <Option value={false}>Active</Option>
            <Option value={true}>Archived</Option>
          </Select>
        </div>

        {/* Medical Records */}
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '50px 0' }}>
            <Spin size="large" />
          </div>
        ) : data?.records && data.records.length > 0 ? (
          <MedicalRecordCards
            records={data.records}
            onRefresh={refetch}
            patientId={patientId}
            onNavigateToRecord={onNavigateToRecord}
          />
        ) : (
          <Empty
            description={
              searchTerm || filter.recordType || filter.isArchived
                ? 'No records found matching your filters'
                : 'No medical records yet'
            }
          >
            {!searchTerm && !filter.recordType && !filter.isArchived && (
              <Button type="primary" onClick={handleCreateNew}>
                Create First Record
              </Button>
            )}
          </Empty>
        )}
      </Space>

      {/* Create/Edit Modal */}
      {isModalOpen && (
        <MedicalRecordModal
          open={isModalOpen}
          onClose={handleModalClose}
          patientId={patientId}
          patientName={patientName}
          recordId={selectedRecordId}
        />
      )}
    </Card>
  );
};

export default MedicalHistorySection;