import React, { useState } from 'react';
import { Input, Select, DatePicker, Space, Button, Row, Col, Collapse } from 'antd';
import { SearchOutlined, ClearOutlined, FilterOutlined } from '@ant-design/icons';
import type { MedicalRecordFilter } from '@/types/medical';
import dayjs from 'dayjs';
import styles from './MedicalRecordSearch.module.css';

const { RangePicker } = DatePicker;
const { Option } = Select;
const { Panel } = Collapse;

interface MedicalRecordSearchProps {
  onSearch: (filter: MedicalRecordFilter) => void;
  onReset: () => void;
  loading?: boolean;
}

const MedicalRecordSearch: React.FC<MedicalRecordSearchProps> = ({
  onSearch,
  onReset,
  loading = false,
}) => {
  const [filter, setFilter] = useState<MedicalRecordFilter>({});
  const [expanded, setExpanded] = useState(false);

  const handleSearch = () => {
    // Clean up empty values
    const cleanFilter = Object.entries(filter).reduce((acc, [key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        acc[key as keyof MedicalRecordFilter] = value;
      }
      return acc;
    }, {} as MedicalRecordFilter);

    onSearch(cleanFilter);
  };

  const handleReset = () => {
    setFilter({});
    onReset();
  };

  const handleQuickSearch = (value: string) => {
    setFilter({ ...filter, searchTerm: value });
    if (!value) {
      onReset();
    }
  };

  const handleQuickSearchEnter = () => {
    if (filter.searchTerm) {
      onSearch({ searchTerm: filter.searchTerm });
    }
  };

  const handleDateChange = (dates: any) => {
    if (dates) {
      setFilter({
        ...filter,
        startDate: dates[0]?.format('YYYY-MM-DD'),
        endDate: dates[1]?.format('YYYY-MM-DD'),
      });
    } else {
      const { startDate, endDate, ...rest } = filter;
      setFilter(rest);
    }
  };

  return (
    <div>
      {/* Quick Search Bar */}
      <Space.Compact className={styles.fullWidthMarginBottom}>
        <Input
          size="large"
          placeholder="Search records by name, procedure, description, or attachments..."
          prefix={<SearchOutlined />}
          value={filter.searchTerm}
          onChange={(e) => handleQuickSearch(e.target.value)}
          onPressEnter={handleQuickSearchEnter}
          allowClear
        />
        <Button
          size="large"
          type="primary"
          icon={<SearchOutlined />}
          onClick={handleQuickSearchEnter}
          loading={loading}
        >
          Search
        </Button>
        <Button
          size="large"
          icon={<FilterOutlined />}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? 'Hide' : 'Show'} Filters
        </Button>
      </Space.Compact>

      {/* Advanced Filters */}
      <Collapse
        activeKey={expanded ? ['filters'] : []}
        onChange={(keys) => setExpanded(keys.includes('filters'))}
        ghost
      >
        <Panel header="Advanced Filters" key="filters" showArrow={false}>
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12} md={8}>
              <label className={styles.filterLabel}>Record Type</label>
              <Select
                className={styles.fullWidth}
                placeholder="All Types"
                value={filter.recordType}
                onChange={(value) => setFilter({ ...filter, recordType: value })}
                allowClear
              >
                <Option value="procedure">Procedure</Option>
                <Option value="note">Note</Option>
              </Select>
            </Col>

            <Col xs={24} sm={12} md={8}>
              <label className={styles.filterLabel}>Status</label>
              <Select
                className={styles.fullWidth}
                placeholder="Active Records"
                value={filter.includeArchived}
                onChange={(value) => setFilter({ ...filter, includeArchived: value })}
                allowClear
              >
                <Option value={false}>Active Only</Option>
                <Option value={true}>Include Archived</Option>
              </Select>
            </Col>

            <Col xs={24} sm={12} md={8}>
              <label className={styles.filterLabel}>Date Range</label>
              <RangePicker
                className={styles.fullWidth}
                value={[
                  filter.startDate ? dayjs(filter.startDate) : null,
                  filter.endDate ? dayjs(filter.endDate) : null,
                ]}
                onChange={handleDateChange}
                format="YYYY-MM-DD"
              />
            </Col>

            <Col xs={24} sm={12} md={8}>
              <label className={styles.filterLabel}>Has Attachments</label>
              <Select
                className={styles.fullWidth}
                placeholder="Any"
                value={filter.hasAttachments}
                onChange={(value) => setFilter({ ...filter, hasAttachments: value })}
                allowClear
              >
                <Option value={true}>With Attachments</Option>
                <Option value={false}>Without Attachments</Option>
              </Select>
            </Col>

            <Col xs={24} sm={12} md={8}>
              <label className={styles.filterLabel}>Has Price</label>
              <Select
                className={styles.fullWidth}
                placeholder="Any"
                value={filter.hasPrice}
                onChange={(value) => setFilter({ ...filter, hasPrice: value })}
                allowClear
              >
                <Option value={true}>With Price</Option>
                <Option value={false}>Without Price</Option>
              </Select>
            </Col>

            <Col xs={24} sm={12} md={8}>
              <label className={styles.filterLabel}>Sort By</label>
              <Select
                className={styles.fullWidth}
                placeholder="Date (Newest First)"
                value={filter.sortBy}
                onChange={(value) => setFilter({ ...filter, sortBy: value })}
                allowClear
              >
                <Option value="date_desc">Date (Newest First)</Option>
                <Option value="date_asc">Date (Oldest First)</Option>
                <Option value="name_asc">Name (A-Z)</Option>
                <Option value="name_desc">Name (Z-A)</Option>
                <Option value="type">Type</Option>
              </Select>
            </Col>
          </Row>

          <div className={styles.filterActions}>
            <Space>
              <Button icon={<ClearOutlined />} onClick={handleReset}>
                Clear Filters
              </Button>
              <Button
                type="primary"
                icon={<SearchOutlined />}
                onClick={handleSearch}
                loading={loading}
              >
                Apply Filters
              </Button>
            </Space>
          </div>
        </Panel>
      </Collapse>
    </div>
  );
};

export default MedicalRecordSearch;