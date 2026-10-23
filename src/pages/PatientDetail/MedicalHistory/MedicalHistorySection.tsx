import React, { useState } from 'react';
import { Card, Button, Space, Input, Select, Badge, Empty, Spin } from 'antd';
import { PlusOutlined, SearchOutlined, FilterOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useMedicalRecords } from '@/hooks/useMedicalRecords';
import MedicalRecordCards from './MedicalRecordCards';
import MedicalRecordModal from '@/components/MedicalRecordModal/MedicalRecordModal';
import { LoadError } from '@/components/common/LoadError';
import type { MedicalRecordFilter, RecordType } from '@/types/medical';
import styles from './MedicalHistory.module.css';

const { Search } = Input;
const { Option } = Select;

const PAGE_SIZE = 50;

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
  const { t } = useTranslation('patients');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRecordId, setSelectedRecordId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilterState] = useState<MedicalRecordFilter>({
    isArchived: false,
  });
  // "Load more" grows one page instead of adding page 2, so the list stays one query.
  const [shownLimit, setShownLimit] = useState(PAGE_SIZE);
  const setFilter: typeof setFilterState = (next) => {
    setShownLimit(PAGE_SIZE);
    setFilterState(next);
  };

  const { data, isLoading, isError, isFetching, refetch } = useMedicalRecords(patientId, filter, {
    page: 1,
    pageSize: shownLimit,
  });
  const shownCount = data?.records?.length ?? 0;
  const totalCount = data?.total ?? shownCount;

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

  const handleTypeFilter = (value: RecordType | 'all') => {
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
      title={t('detail.medicalHistory.title')}
      extra={
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={handleCreateNew}
        >
          {t('detail.medicalHistory.addRecord')}
        </Button>
      }
      className={styles.sectionCard}
    >
      <Space direction="vertical" className={styles.fullWidthSpace} size="middle">
        {/* Search and Filters */}
        <div className={styles.filterContainer}>
          <Search
            placeholder={t('detail.medicalHistory.searchPlaceholder')}
            prefix={<SearchOutlined />}
            allowClear
            enterButton={t('detail.medicalHistory.search')}
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            onSearch={handleSearch}
            className={styles.searchInput}
          />

          <Select
            defaultValue="all"
            className={styles.typeSelect}
            onChange={handleTypeFilter}
            suffixIcon={<FilterOutlined />}
          >
            <Option value="all">{t('detail.medicalHistory.filters.allTypes')}</Option>
            <Option value="procedure">{t('detail.medicalHistory.filters.procedures')}</Option>
            <Option value="note">{t('detail.medicalHistory.filters.notes')}</Option>
            <Option value="test_result">{t('detail.medicalHistory.filters.testResults')}</Option>
          </Select>

          <Select
            defaultValue={false}
            className={styles.archiveSelect}
            onChange={handleArchiveFilter}
          >
            <Option value={false}>{t('detail.medicalHistory.filters.active')}</Option>
            <Option value={true}>{t('detail.medicalHistory.filters.archived')}</Option>
          </Select>
        </div>

        {/* Medical Records */}
        {isError ? (
          <LoadError
            title={t('detail.medicalHistory.loadFailed')}
            onRetry={() => refetch()}
            retrying={isFetching}
          />
        ) : isLoading ? (
          <div className={styles.loadingContainer}>
            <Spin size="large" />
          </div>
        ) : data?.records && data.records.length > 0 ? (
          <>
            <MedicalRecordCards
              records={data.records}
              onRefresh={refetch}
              patientId={patientId}
              onNavigateToRecord={onNavigateToRecord}
            />
            {totalCount > shownCount && (
              <div className={styles.loadMoreRow}>
                <span>{t('detail.medicalHistory.showing', { shown: shownCount, total: totalCount })}</span>
                <Button onClick={() => setShownLimit(shownLimit + PAGE_SIZE)} loading={isFetching}>
                  {t('detail.medicalHistory.loadMore')}
                </Button>
              </div>
            )}
          </>
        ) : (
          <Empty
            description={
              searchTerm || filter.recordType || filter.isArchived
                ? t('detail.medicalHistory.empty.noMatchingRecords')
                : t('detail.medicalHistory.empty.noRecords')
            }
          >
            {!searchTerm && !filter.recordType && !filter.isArchived && (
              <Button type="primary" icon={<PlusOutlined />} onClick={handleCreateNew}>
                {t('detail.medicalHistory.createFirstRecord')}
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