import React, { useState, useMemo, useEffect } from 'react';
import {
  Modal,
  Form,
  Input,
  Checkbox,
  Button,
  Space,
  Typography,
  Divider,
  App,
  Tag,
} from 'antd';
import { FilePdfOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { MedicalAttachment } from '@/types/medical';
import type { PatientOverrides, PatientInfo, DeviceFileInfo } from '@/types/report';
import styles from './PrintReportModal.module.css';
import { formatDateTime } from '../../utils/dateFormatter';

const { Text } = Typography;

interface PrintReportModalProps {
  open: boolean;
  onClose: () => void;
  medicalRecordId: number;
  attachments: MedicalAttachment[];
  patientInfo: PatientInfo;
  onGenerate: (selectedAttachmentIds: number[], patientOverrides: PatientOverrides) => Promise<void>;
}

// Map device type to readable name
const getDeviceDisplayName = (deviceType: string | undefined, unknownLabel: string): string => {
  switch (deviceType) {
    case 'exigo_eos_vet':
      return 'Exigo Eos Vet';
    case 'healvet_hv_fia_3000':
      return 'Healvet HV-FIA 3000';
    case 'mnchip_pointcare_pcr_v1':
      return 'PointCare Chemistry';
    default:
      return deviceType || unknownLabel;
  }
};

// Get device type color
const getDeviceTypeColor = (deviceType?: string): string => {
  switch (deviceType) {
    case 'exigo_eos_vet':
      return 'blue';
    case 'healvet_hv_fia_3000':
      return 'purple';
    case 'mnchip_pointcare_pcr_v1':
      return 'green';
    default:
      return 'default';
  }
};

const PrintReportModal: React.FC<PrintReportModalProps> = ({
  open,
  onClose,
  attachments,
  patientInfo,
  onGenerate,
}) => {
  const { t } = useTranslation(['medical', 'common', 'patients']);
  const { notification } = App.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // Filter attachments to only include device test results (not generated PDFs)
  const deviceFiles = useMemo<DeviceFileInfo[]>(() => {
    return attachments
      .filter((att) => {
        const hasDeviceMetadata = !!att.deviceType && !!att.deviceName;
        const isTestResult = att.attachmentType === 'test_result';
        const isLegacyDeviceFile =
          hasDeviceMetadata &&
          att.attachmentType !== 'generated_pdf' &&
          att.mimeType !== 'application/pdf';
        return isTestResult || isLegacyDeviceFile;
      })
      .map((att) => ({
        id: att.id,
        originalName: att.originalName,
        deviceType: att.deviceType,
        deviceName: att.deviceName,
        uploadedAt: att.uploadedAt,
        mimeType: att.mimeType,
      }));
  }, [attachments]);

  // Initialize selected IDs with all device files when modal opens
  useEffect(() => {
    if (open && deviceFiles.length > 0) {
      setSelectedIds(deviceFiles.map((f) => f.id));
    }
  }, [open, deviceFiles]);

  // Initialize form with patient info
  useEffect(() => {
    if (open) {
      form.setFieldsValue({
        owner: patientInfo.owner,
        patientName: patientInfo.name,
        species: patientInfo.species,
        gender: patientInfo.gender,
        dateOfBirth: patientInfo.dateOfBirth || '',
        microchipId: patientInfo.microchipId || '',
      });
    }
  }, [open, patientInfo, form]);

  const handleSelectAll = () => {
    setSelectedIds(deviceFiles.map((f) => f.id));
  };

  const handleDeselectAll = () => {
    setSelectedIds([]);
  };

  const handleToggleFile = (fileId: number) => {
    setSelectedIds((prev) =>
      prev.includes(fileId)
        ? prev.filter((id) => id !== fileId)
        : [...prev, fileId]
    );
  };

  const handleGenerate = async () => {
    if (selectedIds.length === 0) {
      notification.warning({
        message: t('common:warning'),
        description: t('medical:printReport.selectAtLeastOne'),
        placement: 'bottomRight',
        duration: 4,
      });
      return;
    }

    setLoading(true);
    try {
      const formValues = form.getFieldsValue();
      const overrides: PatientOverrides = {};

      // Only include fields that differ from original values
      if (formValues.owner !== patientInfo.owner) {
        overrides.owner = formValues.owner;
      }
      if (formValues.patientName !== patientInfo.name) {
        overrides.patientName = formValues.patientName;
      }
      if (formValues.species !== patientInfo.species) {
        overrides.species = formValues.species;
      }
      if (formValues.gender !== patientInfo.gender) {
        overrides.gender = formValues.gender;
      }
      if (formValues.dateOfBirth !== (patientInfo.dateOfBirth || '')) {
        overrides.dateOfBirth = formValues.dateOfBirth;
      }
      if (formValues.microchipId !== (patientInfo.microchipId || '')) {
        overrides.microchipId = formValues.microchipId;
      }

      await onGenerate(selectedIds, overrides);
      onClose();
    } catch (error: any) {
      notification.error({
        message: t('common:error'),
        description: error?.toString() || t('medical:printReport.generateFailed'),
        placement: 'bottomRight',
        duration: 5,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={t('medical:printReport.title')}
      open={open}
      onCancel={onClose}
      footer={null}
      width={700}
      destroyOnHidden
    >
      <div className={styles.sectionTitle}>
        {t('medical:printReport.patientInfo')}
      </div>
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        {t('medical:printReport.patientInfoHint')}
      </Text>

      <Form form={form} layout="vertical">
        <div className={styles.formRow}>
          <Form.Item name="owner" label={t('patients:fields.owner')} className={styles.formItem}>
            <Input placeholder={t('medical:printReport.ownerPlaceholder')} />
          </Form.Item>
          <Form.Item name="patientName" label={t('medical:printReport.patientName')} className={styles.formItem}>
            <Input placeholder={t('medical:printReport.patientNamePlaceholder')} />
          </Form.Item>
        </div>

        <div className={styles.formRow}>
          <Form.Item name="species" label={t('patients:fields.species')} className={styles.formItem}>
            <Input placeholder={t('patients:fields.species')} />
          </Form.Item>
          <Form.Item name="gender" label={t('patients:fields.gender')} className={styles.formItem}>
            <Input placeholder={t('patients:fields.gender')} />
          </Form.Item>
        </div>

        <div className={styles.formRow}>
          <Form.Item name="dateOfBirth" label={t('patients:fields.dateOfBirth')} className={styles.formItem}>
            <Input placeholder="YYYY-MM-DD" />
          </Form.Item>
          <Form.Item name="microchipId" label={t('patients:fields.microchipId')} className={styles.formItem}>
            <Input placeholder={t('patients:fields.microchipId')} />
          </Form.Item>
        </div>
      </Form>

      <Divider className={styles.sectionDivider} />

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <div className={styles.sectionTitle} style={{ marginBottom: 0 }}>
          {t('medical:printReport.selectFiles')}
        </div>
        <Space>
          <Button size="small" onClick={handleSelectAll}>
            {t('medical:printReport.selectAll')}
          </Button>
          <Button size="small" onClick={handleDeselectAll}>
            {t('medical:printReport.deselectAll')}
          </Button>
        </Space>
      </div>

      {deviceFiles.length === 0 ? (
        <div className={styles.emptyMessage}>
          {t('medical:printReport.noDeviceFiles')}
        </div>
      ) : (
        <div className={styles.deviceFileList}>
          {deviceFiles.map((file) => (
            <div key={file.id} className={styles.deviceFileItem}>
              <div className={styles.deviceFileInfo}>
                <Checkbox
                  checked={selectedIds.includes(file.id)}
                  onChange={() => handleToggleFile(file.id)}
                />
                <div className={styles.deviceFileDetails}>
                  <div className={styles.fileName}>{file.originalName}</div>
                  <div className={styles.deviceMeta}>
                    <Tag color={getDeviceTypeColor(file.deviceType)}>
                      {getDeviceDisplayName(file.deviceType, t('medical:printReport.unknownDevice'))}
                    </Tag>
                    <Text type="secondary">
                      {formatDateTime(file.uploadedAt)}
                    </Text>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className={styles.footerButtons}>
        <Button onClick={onClose}>{t('common:cancel')}</Button>
        <Button
          type="primary"
          icon={<FilePdfOutlined />}
          onClick={handleGenerate}
          loading={loading}
          disabled={selectedIds.length === 0}
        >
          {t('medical:printReport.generateAndPrint')}
        </Button>
      </div>
    </Modal>
  );
};

export default PrintReportModal;
