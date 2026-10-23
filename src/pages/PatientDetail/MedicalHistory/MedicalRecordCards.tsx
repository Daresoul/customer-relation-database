import React, { useState } from 'react';
import { Card, Typography, Tag, Button, Space, Dropdown, Descriptions, Modal, App } from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  MoreOutlined,
  CalendarOutlined,
  FileTextOutlined,
  MedicineBoxOutlined,
  PaperClipOutlined,
  DownloadOutlined,
  ExperimentOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { MedicalRecord } from '@/types/medical';
import { useArchiveMedicalRecord, useDownloadAttachment } from '@/hooks/useMedicalRecords';
import { Link, useNavigate } from 'react-router-dom';
import { formatDate, formatDateTime } from '@/utils/dateFormatter';
import DiagnosisTagList from '@/components/DiagnosisTagList';
import styles from './MedicalHistory.module.css';

const { Text, Title, Paragraph } = Typography;

interface MedicalRecordCardsProps {
  records: MedicalRecord[];
  onRefresh: () => void;
  patientId: number;
  /** Opens the record page; `attachmentId` opens that document there. */
  onNavigateToRecord?: (recordId: number, attachmentId?: number) => void;
}

const MedicalRecordCards: React.FC<MedicalRecordCardsProps> = ({
  records,
  onRefresh,
  patientId,
  onNavigateToRecord,
}) => {
  const { t } = useTranslation('medical');
  const [archiveModalVisible, setArchiveModalVisible] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<MedicalRecord | null>(null);
  const archiveMutation = useArchiveMedicalRecord();
  const downloadMutation = useDownloadAttachment();
  const navigate = useNavigate();
  const { notification } = App.useApp();

  const handleArchiveClick = (record: MedicalRecord) => {
    setSelectedRecord(record);
    setArchiveModalVisible(true);
  };

  const handleArchiveConfirm = async () => {
    if (!selectedRecord) return;

    try {
      await archiveMutation.mutateAsync({
        recordId: selectedRecord.id,
        archive: !selectedRecord.isArchived,
        patientId,
      });
      setArchiveModalVisible(false);
      setSelectedRecord(null);
      onRefresh();
    } catch (error) {
      notification.error({
        message: t('common:error'),
        description: selectedRecord.isArchived ? t('messages.restoreFailed') : t('messages.archiveFailed'),
        placement: "bottomRight",
        duration: 5
      });
    }
  };

  const handleDownloadAttachment = async (attachmentId: number, fileName: string) => {
    try {
      await downloadMutation.mutateAsync({
        attachmentId,
        fileName,
      });
    } catch (error) {
      notification.error({ message: t('common:error'), description: t('messages.downloadFailed'), placement: "bottomRight", duration: 5 });
    }
  };

  const renderRecordCard = (record: MedicalRecord) => {
    const isProcedure = record.recordType === 'procedure';
    const isTestResult = record.recordType === 'test_result';

    const menuItems = [
      {
        key: 'edit',
        label: t('actions.edit'),
        icon: <EditOutlined />,
        onClick: () => navigate(`/medical-records/${record.id}?edit=1`),
      },
      {
        key: 'archive',
        label: record.isArchived ? t('actions.restore') : t('actions.archive'),
        icon: <DeleteOutlined />,
        onClick: () => handleArchiveClick(record),
      },
    ];

    // Determine icon based on type
    const recordIcon = isProcedure ? (
      <MedicineBoxOutlined className={styles.procedureIcon} />
    ) : isTestResult ? (
      <ExperimentOutlined className={styles.testResultIcon} />
    ) : (
      <FileTextOutlined className={styles.noteIcon} />
    );

    // Determine tag color and label
    const getTypeTag = () => {
      if (isProcedure) return { color: 'blue', label: t('recordTypes.procedure') };
      if (isTestResult) return { color: 'purple', label: t('recordTypes.testResult') };
      return { color: 'green', label: t('recordTypes.note') };
    };
    const typeTag = getTypeTag();

    return (
      <Card
        key={record.id}
        className={`medical-record-card ${styles.recordCardItem}`}
        title={
          <div className={styles.cardTitleRow}>
            <Space>
              {recordIcon}
              <Title level={5} className={styles.cardTitleText}>
                <Link
                  to={`/medical-records/${record.id}`}
                  className={styles.inheritColor}
                  onClick={(e) => {
                    if (onNavigateToRecord) {
                      e.preventDefault();
                      onNavigateToRecord(record.id);
                    }
                  }}
                >
                  {record.name}
                </Link>
              </Title>
            </Space>
            <Space>
              <Tag color={typeTag.color}>
                {typeTag.label}
              </Tag>
              {record.isArchived && <Tag color="orange">{t('status.archived')}</Tag>}
              <Dropdown
                menu={{ items: menuItems }}
                trigger={['click']}
              >
                <Button type="text" icon={<MoreOutlined />} />
              </Dropdown>
            </Space>
          </div>
        }
        extra={
          <Text type="secondary">
            <CalendarOutlined /> {formatDate(record.createdAt)}
          </Text>
        }
      >
        <Descriptions column={1} size="small">
          <Descriptions.Item label={t('fields.description')}>
            <Paragraph className={styles.descriptionParagraph} ellipsis={{ rows: 4, expandable: true }}>
              {record.description}
            </Paragraph>
          </Descriptions.Item>

          <Descriptions.Item label={t('fields.createdAt')}>
            <Text type="secondary">{formatDateTime(record.createdAt)}</Text>
            {record.createdBy && (
              <Text type="secondary"> {t('history.by', { name: record.createdBy })}</Text>
            )}
          </Descriptions.Item>

          {/* Only show generated PDFs (and user-uploaded files) in the
              medical-history card — raw device data (XML/HL7) lives
              behind the medical-record detail page and would just
              clutter the patient summary view. Same `attachmentType
              !== 'test_result'` filter the detail page uses to split
              documents from device data. */}
          {(() => {
            const visibleAttachments = (record.attachments || []).filter(
              (a) => a.attachmentType !== 'test_result',
            );
            if (visibleAttachments.length === 0) return null;
            return (
              <Descriptions.Item label={
                <Space>
                  <PaperClipOutlined />
                  <span>{t('fields.attachments')}</span>
                </Space>
              }>
                <Space wrap>
                  {visibleAttachments.map(attachment => {
                  const isPdf = attachment.mimeType?.toLowerCase() === 'application/pdf' ||
                                attachment.originalName?.toLowerCase().endsWith('.pdf');

                  return (
                    <Button
                      key={attachment.id}
                      type="link"
                      size="small"
                      icon={isPdf ? <FileTextOutlined /> : <DownloadOutlined />}
                      onClick={() => {
                        if (isPdf) {
                          // The record page opens this document when the URL names it.
                          if (onNavigateToRecord) {
                            onNavigateToRecord(record.id, attachment.id);
                          } else {
                            navigate(`/medical-records/${record.id}?attachmentId=${attachment.id}`);
                          }
                        } else {
                          handleDownloadAttachment(attachment.id, attachment.originalName);
                        }
                      }}
                      className={styles.attachmentTag}
                    >
                      {attachment.originalName}
                      {attachment.fileSize && (
                        <Text type="secondary" className={styles.attachmentText}>
                          ({(attachment.fileSize / 1024).toFixed(1)} KB)
                        </Text>
                      )}
                      </Button>
                    );
                  })}
                </Space>
              </Descriptions.Item>
            );
          })()}

          <Descriptions.Item label={t('fields.updatedAt')}>
            <Text type="secondary">{formatDateTime(record.updatedAt)}</Text>
            {record.updatedBy && (
              <Text type="secondary"> {t('history.by', { name: record.updatedBy })}</Text>
            )}
          </Descriptions.Item>

          {record.version > 1 && (
            <Descriptions.Item label={t('fields.version')}>
              <Text type="secondary">{t('versionLabel', { version: record.version })}</Text>
            </Descriptions.Item>
          )}
        </Descriptions>

        {/* Diagnosis tags — compact, top 3 inline with "+N more" for
            the rest. DiagnosisTagList renders nothing (no chrome) for
            records with no diagnoses, so the entire row disappears
            for unrelated records and the card stays the same height
            it did before this feature shipped. The `showLabel` prefix
            keeps the row self-explanatory at a glance — important on
            a dashboard where the user might scan dozens of cards. */}
        <div style={{ marginTop: 8 }}>
          <DiagnosisTagList
            recordId={record.id}
            maxVisible={3}
            size="small"
            showLabel
          />
        </div>
      </Card>
    );
  };

  return (
    <>
      <div className={styles.fullWidthDiv}>
        {records.map(renderRecordCard)}
      </div>

      <Modal
        title={selectedRecord?.isArchived ? t('modal.restoreTitle') : t('modal.archiveTitle')}
        open={archiveModalVisible}
        onOk={handleArchiveConfirm}
        onCancel={() => {
          setArchiveModalVisible(false);
          setSelectedRecord(null);
        }}
        okText={selectedRecord?.isArchived ? t('actions.restore') : t('actions.archive')}
        okType={selectedRecord?.isArchived ? 'primary' : 'danger'}
      >
        <p>
          {selectedRecord?.isArchived ? t('messages.confirmRestore') : t('messages.confirmArchive')}
        </p>
        <p>
          <strong>{selectedRecord?.name}</strong>
        </p>
        {!selectedRecord?.isArchived && (
          <p>{t('messages.archiveInfo')}</p>
        )}
      </Modal>

    </>
  );
};

export default MedicalRecordCards;
