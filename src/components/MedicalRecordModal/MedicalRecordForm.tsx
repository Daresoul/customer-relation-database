import React, { useState, useEffect } from 'react';
import { Form, Input, Select, Button, Space, Divider, InputNumber, List, Typography, Upload } from 'antd';
import { SaveOutlined, CloseOutlined, UploadOutlined, DeleteOutlined, InboxOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import FileUpload from '../FileUpload/FileUpload';
import FileAttachmentList from '../FileUpload/FileAttachmentList';
import { useCurrencies, useMedicalRecord } from '@/hooks/useMedicalRecords';
import { useAppSettings } from '@/hooks/useAppSettings';
import { MedicalService } from '@/services/medicalService';
import type { MedicalRecord, CreateMedicalRecordInput, UpdateMedicalRecordInput } from '@/types/medical';
import type { UploadFile } from 'antd';
import styles from './MedicalRecordForm.module.css';

const { TextArea } = Input;
const { Option } = Select;
const { Text } = Typography;
const { Dragger } = Upload;

interface MedicalRecordFormProps {
  initialValues?: MedicalRecord;
  onSubmit: (values: CreateMedicalRecordInput | UpdateMedicalRecordInput, files?: File[]) => void;
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
  const [form] = Form.useForm();
  const [recordType, setRecordType] = useState<string>(initialValues?.recordType || 'procedure');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const { data: currencies } = useCurrencies();
  const { settings } = useAppSettings();

  // Removed debug log to avoid circular reference issues
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
      });
      setRecordType(initialValues.recordType);
    }
  }, [initialValues?.id]); // Only depend on the ID to avoid circular references

  // Removed useEffect that was causing circular reference warning
  // Default currency is now set in the form's initialValues instead

  const handleFinish = (values: any) => {

    const formData = isEdit
      ? {
          name: values.name,
          description: values.description,
          price: values.price,
          currencyId: values.currencyId,
        } as UpdateMedicalRecordInput
      : {
          patientId: patientId,
          recordType: values.recordType,
          name: values.name,
          description: values.description,
          price: values.price,
          currencyId: values.currencyId,
        } as CreateMedicalRecordInput;

    onSubmit(formData, !isEdit ? pendingFiles : undefined);
  };

  const handleRecordTypeChange = (value: string) => {
    setRecordType(value);
    if (value === 'note') {
      form.setFieldValue('procedureName', undefined);
      form.setFieldValue('price', undefined);
      form.setFieldValue('currencyId', undefined);
    } else if (value === 'procedure' && settings?.currencyId) {
      // Set default currency when switching to procedure
      form.setFieldValue('currencyId', settings.currencyId);
    }
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
      {!isEdit && (
        <Form.Item
          name="recordType"
          label={t('medical:fields.recordType')}
          rules={[{ required: true, message: t('forms:validation.required') }]}
        >
          <Select onChange={handleRecordTypeChange}>
            <Option value="note">{t('medical:recordTypes.note')}</Option>
            <Option value="procedure">{t('medical:recordTypes.procedure')}</Option>
          </Select>
        </Form.Item>
      )}

      <Form.Item
        name="name"
        label={recordType === 'procedure' ? t('medical:fields.procedureName') : t('medical:fields.title')}
        rules={[
          { required: true, message: t('forms:validation.required') },
          { max: 200, message: t('forms:validation.maxLength', { max: 200 }) },
        ]}
      >
        <Input placeholder={recordType === 'procedure' ? t('medical:placeholders.procedureName') : t('medical:placeholders.noteTitle')} />
      </Form.Item>

      <Form.Item
        name="description"
        label={t('medical:fields.description')}
        rules={[{ required: true, message: t('forms:validation.required') }]}
      >
        <TextArea
          rows={6}
          placeholder={t('medical:placeholders.description')}
          showCount
          maxLength={5000}
        />
      </Form.Item>

      {recordType === 'procedure' && (
        <Space size="middle" className={styles.fullWidth}>
          <Form.Item
            name="price"
            label={t('medical:fields.price')}
            className={styles.dateInput}
          >
            <InputNumber
              min={0}
              precision={2}
              placeholder="0.00"
              className={styles.fullWidth}
            />
          </Form.Item>

          <Form.Item
            name="currencyId"
            label={t('medical:fields.currency')}
            className={styles.severityInput}
          >
            <Select placeholder={t('common:selectPlaceholder')} allowClear>
              {currencies?.map(currency => (
                <Option key={currency.id} value={currency.id}>
                  {currency.symbol} {currency.code}
                </Option>
              ))}
            </Select>
          </Form.Item>
        </Space>
      )}

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
          <Dragger
            beforeUpload={(file) => {
              const error = MedicalService.validateFile(file);
              if (error) {
                notification.error({ message: "Error", description: error, placement: "bottomRight", duration: 5 });
                return Upload.LIST_IGNORE;
              }
              // Don't add to state here, let onChange handle it
              return false;
            }}
            customRequest={({ file, onSuccess, onError }) => {
              // Immediately mark as success to trigger proper onChange
              setTimeout(() => {
                onSuccess?.(null);
              }, 0);
            }}
            onChange={({ file, fileList: newFileList }) => {

              // Get all valid files from the fileList
              const validFiles: File[] = [];

              newFileList.forEach(file => {
                // Only include files that have originFileObj and aren't errors
                if (file.originFileObj && file.status !== 'error') {
                  validFiles.push(file.originFileObj as File);
                }
              });

              // Update the pending files state
              setPendingFiles(validFiles);
            }}
            onDrop={(e) => {
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
    </Form>
  );
};

export default MedicalRecordForm;