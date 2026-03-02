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
  Spin,
  App,
  Tag,
} from 'antd';
import { PrinterOutlined, FilePdfOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { MedicalAttachment } from '@/types/medical';
import type { PatientOverrides, PatientInfo, DeviceFileInfo } from '@/types/report';
import { MedicalService } from '@/services/medicalService';
import styles from './PrintReportModal.module.css';

const { Text, Title } = Typography;

interface PrintReportModalProps {
  open: boolean;
  onClose: () => void;
  medicalRecordId: number;
  attachments: MedicalAttachment[];
  patientInfo: PatientInfo;
  onGenerate: (selectedAttachmentIds: number[], patientOverrides: PatientOverrides) => Promise<void>;
}

// Map device type to readable name
const getDeviceDisplayName = (deviceType?: string): string => {
  switch (deviceType) {
    case 'exigo_eos_vet':
      return 'Exigo Eos Vet';
    case 'healvet_hv_fia_3000':
      return 'Healvet HV-FIA 3000';
    case 'mnchip_pointcare_pcr_v1':
      return 'PointCare Chemistry';
    default:
      return deviceType || 'Unknown Device';
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
  medicalRecordId,
  attachments,
  patientInfo,
  onGenerate,
}) => {
  const { t } = useTranslation(['medical', 'common']);
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
        description: 'Please select at least one device file to include in the report.',
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
        description: error?.toString() || 'Failed to generate report',
        placement: 'bottomRight',
        duration: 5,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="Print Report Configuration"
      open={open}
      onCancel={onClose}
      footer={null}
      width={700}
      destroyOnHidden
    >
      <div className={styles.sectionTitle}>
        Patient Information (for this print only)
      </div>
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        Changes here only affect this print and will not be saved to the database.
      </Text>

      <Form form={form} layout="vertical">
        <div className={styles.formRow}>
          <Form.Item name="owner" label="Owner" className={styles.formItem}>
            <Input placeholder="Owner name" />
          </Form.Item>
          <Form.Item name="patientName" label="Patient Name" className={styles.formItem}>
            <Input placeholder="Patient name" />
          </Form.Item>
        </div>

        <div className={styles.formRow}>
          <Form.Item name="species" label="Species" className={styles.formItem}>
            <Input placeholder="Species" />
          </Form.Item>
          <Form.Item name="gender" label="Gender" className={styles.formItem}>
            <Input placeholder="Gender" />
          </Form.Item>
        </div>

        <div className={styles.formRow}>
          <Form.Item name="dateOfBirth" label="Date of Birth" className={styles.formItem}>
            <Input placeholder="YYYY-MM-DD" />
          </Form.Item>
          <Form.Item name="microchipId" label="Microchip ID" className={styles.formItem}>
            <Input placeholder="Microchip ID" />
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
          Select Files to Include
        </div>
        <Space>
          <Button size="small" onClick={handleSelectAll}>
            Select All
          </Button>
          <Button size="small" onClick={handleDeselectAll}>
            Deselect All
          </Button>
        </Space>
      </div>

      {deviceFiles.length === 0 ? (
        <div className={styles.emptyMessage}>
          No device test result files found for this medical record.
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
                      {getDeviceDisplayName(file.deviceType)}
                    </Tag>
                    <Text type="secondary">
                      {new Date(file.uploadedAt).toLocaleString()}
                    </Text>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className={styles.footerButtons}>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          type="primary"
          icon={<FilePdfOutlined />}
          onClick={handleGenerate}
          loading={loading}
          disabled={selectedIds.length === 0}
        >
          Generate & Print
        </Button>
      </div>
    </Modal>
  );
};

export default PrintReportModal;
