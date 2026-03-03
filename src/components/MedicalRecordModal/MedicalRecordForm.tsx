/**
 * MedicalRecordForm - Form for creating and editing medical records
 *
 * Refactored to use MedicalRecordFieldGroup for reusable field definitions.
 */

import React, { useState, useEffect } from 'react';
import { Form, Button, Space, Divider, Typography, Upload, Drawer, App } from 'antd';
import { SaveOutlined, CloseOutlined, InboxOutlined, HistoryOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import FileUpload from '../FileUpload/FileUpload';
import FileAttachmentList from '../FileUpload/FileAttachmentList';
import RecentDeviceFiles from '../RecentDeviceFiles';
import { useCurrencies, useMedicalRecord } from '@/hooks/useMedicalRecords';
import { useSearchRecordTemplates } from '@/hooks/useRecordTemplates';
import { useAppSettings } from '@/hooks/useAppSettings';
import { useDebounce } from '@/hooks/useDebounce';
import { MedicalService } from '@/services/medicalService';
import { TabbedMedicalRecordFields } from '@/components/forms/fieldGroups';
import type { MedicalRecord, CreateMedicalRecordInput, UpdateMedicalRecordInput, RecordTemplate, DeviceDataInput } from '@/types/medical';
import type { RecordType } from '@/components/forms/fieldGroups';
import type { UploadFile } from 'antd';
import styles from './MedicalRecordForm.module.css';

const { Text } = Typography;
const { Dragger } = Upload;

interface MedicalRecordFormProps {
  initialValues?: MedicalRecord;
  onSubmit: (values: CreateMedicalRecordInput | UpdateMedicalRecordInput, files?: File[], fileSourceIds?: Map<string, string>, deviceDataList?: DeviceDataInput[]) => void;
  onCancel: () => void;
  loading: boolean;
  isEdit: boolean;
  patientId: number;
  recordId: number | null;
}

const MedicalRecordForm: React.FC<MedicalRecordFormProps> = ({
  initialValues,
  onSubmit,
  onCancel,
  loading,
  isEdit,
  patientId,
  recordId,
}) => {
  const { t } = useTranslation(['medical', 'common', 'forms']);
  const { notification } = App.useApp();
  const [form] = Form.useForm();
  const [recordType, setRecordType] = useState<RecordType>(initialValues?.recordType || 'procedure');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [fileSourceIds, setFileSourceIds] = useState<Map<string, string>>(new Map());
  const [fileDeviceData, setFileDeviceData] = useState<Map<string, DeviceDataInput>>(new Map());
  const [recentFilesDrawerOpen, setRecentFilesDrawerOpen] = useState(false);
  const [titleSearchTerm, setTitleSearchTerm] = useState<string>('');
  const debouncedSearchTerm = useDebounce(titleSearchTerm, 300);
  const { data: currencies = [] } = useCurrencies();
  const { settings } = useAppSettings();
  const { data: searchedTemplates, isLoading: isSearching } = useSearchRecordTemplates(debouncedSearchTerm, recordType);

  const { data: recordDetail, refetch: refetchRecord } = useMedicalRecord(
    recordId || 0,
    false
  );

  useEffect(() => {
    if (initialValues) {
      form.setFieldsValue({
        recordType: initialValues.recordType,
        name: initialValues.name,
        procedureName: initialValues.procedureName,
        description: initialValues.description,
        price: initialValues.price,
        currencyId: initialValues.currencyId,
        prescriptionNotes: initialValues.prescriptionNotes,
      });
      setRecordType(initialValues.recordType);
    }
  }, [initialValues?.id, form]);

  const handleFinish = (values: any) => {
    const formData = isEdit
      ? {
          name: values.name,
          description: values.description,
          price: values.price,
          currencyId: values.currencyId,
          prescriptionNotes: values.prescriptionNotes,
        } as UpdateMedicalRecordInput
      : {
          patientId: patientId,
          recordType: values.recordType,
          name: values.name,
          description: values.description,
          price: values.price,
          currencyId: values.currencyId,
          prescriptionNotes: values.prescriptionNotes,
        } as CreateMedicalRecordInput;

    // Collect device data from files that have it (for PDF generation)
    const deviceDataList: DeviceDataInput[] = [];
    if (!isEdit) {
      pendingFiles.forEach(file => {
        const deviceData = fileDeviceData.get(file.name);
        if (deviceData) {
          deviceDataList.push(deviceData);
        }
      });
    }

    onSubmit(formData, !isEdit ? pendingFiles : undefined, !isEdit ? fileSourceIds : undefined, deviceDataList.length > 0 ? deviceDataList : undefined);
  };

  const handleRecordTypeChange = (value: RecordType) => {
    setRecordType(value);
    setTitleSearchTerm('');
    if (value === 'note' || value === 'test_result') {
      form.setFieldValue('procedureName', undefined);
      form.setFieldValue('price', undefined);
      form.setFieldValue('currencyId', undefined);
    } else if (value === 'procedure' && settings?.currencyId) {
      form.setFieldValue('currencyId', settings.currencyId);
    }
  };

  const handleAddRecentFile = async (fileId: string, originalName: string) => {
    try {
      const fileData = await MedicalService.getDeviceFileById(fileId);
      const file = new File([new Uint8Array(fileData.fileData)], originalName, {
        type: fileData.mimeType || 'application/octet-stream',
      });

      setPendingFiles(prev => [...prev, file]);
      setFileSourceIds(prev => new Map(prev).set(originalName, fileId));

      if (fileData.deviceType && fileData.deviceName) {
        const deviceData: DeviceDataInput = {
          deviceTestData: fileData.testResults || null,
          deviceType: fileData.deviceType,
          deviceName: fileData.deviceName,
        };
        setFileDeviceData(prev => new Map(prev).set(originalName, deviceData));
      }

      notification.success({
        message: t('common:success'),
        description: `Added ${originalName} to pending files`,
        placement: 'bottomRight',
        duration: 3,
      });

      setRecentFilesDrawerOpen(false);
    } catch (error) {
      console.error('[MedicalRecordForm] Failed to add recent file:', error);
      notification.error({
        message: t('common:error'),
        description: 'Failed to add file from history',
        placement: 'bottomRight',
        duration: 5,
      });
    }
  };

  const handleTemplateSelect = (template: RecordTemplate) => {
    // Template fields are already set by MedicalRecordFieldGroup
    // This callback is for any additional logic if needed
  };

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={handleFinish}
      initialValues={{
        recordType: 'procedure',
        ...(settings?.currencyId ? { currencyId: settings.currencyId } : {})
      }}
    >
      {/* Medical Record Fields using tabbed component */}
      <TabbedMedicalRecordFields
        form={form}
        recordType={recordType}
        onRecordTypeChange={handleRecordTypeChange}
        currencies={currencies}
        templates={searchedTemplates}
        isSearchingTemplates={isSearching}
        onTemplateSearch={setTitleSearchTerm}
        onTemplateSelect={handleTemplateSelect}
        hideRecordType={isEdit}
        fullWidthClassName={styles.fullWidth}
        dateInputClassName={styles.dateInput}
        currencyInputClassName={styles.severityInput}
      />

      <Divider />

      {/* File Attachments Section */}
      {isEdit && recordId && (
        <div className={styles.filesSection}>
          <h4>{t('medical:fileAttachments')}</h4>
          {recordDetail?.attachments && recordDetail.attachments.length > 0 ? (
            <FileAttachmentList
              attachments={recordDetail.attachments}
              onDelete={() => refetchRecord()}
            />
          ) : (
            <Text type="secondary">{t('medical:noAttachments')}</Text>
          )}
          <div className={styles.medicationList}>
            <FileUpload
              medicalRecordId={recordId}
              onUploadSuccess={() => refetchRecord()}
            />
          </div>
        </div>
      )}

      {!isEdit && (
        <div className={styles.filesSection}>
          <h4>{t('medical:fileAttachments')}</h4>
          <Button
            type="link"
            icon={<HistoryOutlined />}
            onClick={() => setRecentFilesDrawerOpen(true)}
            style={{ marginBottom: 8, paddingLeft: 0 }}
          >
            Browse Recent Device Files
          </Button>
          <Dragger
            beforeUpload={(file) => {
              const error = MedicalService.validateFile(file);
              if (error) {
                notification.error({ message: "Error", description: error, placement: "bottomRight", duration: 5 });
                return Upload.LIST_IGNORE;
              }
              return false;
            }}
            customRequest={({ onSuccess }) => {
              setTimeout(() => {
                onSuccess?.(null);
              }, 0);
            }}
            onChange={({ fileList: newFileList }) => {
              const validFiles: File[] = [];
              newFileList.forEach(file => {
                if (file.originFileObj && file.status !== 'error') {
                  validFiles.push(file.originFileObj as File);
                }
              });
              setPendingFiles(validFiles);
            }}
            fileList={pendingFiles.map((file, index) => ({
              uid: `-${index}-${file.name}-${file.size}`,
              name: file.name,
              size: file.size,
              type: file.type,
              status: 'done',
              originFileObj: file,
            } as UploadFile))}
            multiple
            accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.jpg,.jpeg,.png,.gif,.bmp"
            style={{ marginBottom: pendingFiles.length > 0 ? 8 : 0 }}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined className={styles.uploadIcon} />
            </p>
            <p className="ant-upload-text">{t('medical:form.dropFile')}</p>
            <p className="ant-upload-hint">{t('medical:form.supportedFormats')}</p>
          </Dragger>
          {pendingFiles.length > 0 && (
            <Text type="secondary" className={styles.uploadHint}>
              {t('medical:fileUploadPending', { count: pendingFiles.length })}
            </Text>
          )}
        </div>
      )}

      <Form.Item className={styles.submitButton}>
        <Space>
          <Button
            type="primary"
            htmlType="submit"
            loading={loading}
            icon={<SaveOutlined />}
          >
            {isEdit ? t('common:buttons.update') : t('common:buttons.create')}
          </Button>
          <Button onClick={onCancel} icon={<CloseOutlined />}>
            {t('common:buttons.cancel')}
          </Button>
        </Space>
      </Form.Item>

      {/* Recent Files Drawer */}
      <Drawer
        title="Recent Device Files (Last 14 Days)"
        placement="right"
        width={800}
        onClose={() => setRecentFilesDrawerOpen(false)}
        open={recentFilesDrawerOpen}
      >
        <RecentDeviceFiles
          days={14}
          onAddToRecord={handleAddRecentFile}
        />
      </Drawer>
    </Form>
  );
};

export default MedicalRecordForm;
