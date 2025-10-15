import React, { useState, useEffect } from 'react';
import {
  Modal,
  Form,
  Input,
  Select,
  Button,
  Space,
  List,
  Typography,
  Divider,
  InputNumber,
  App,
  Tag,
  Card,
} from 'antd';
import {
  SaveOutlined,
  CloseOutlined,
  FileOutlined,
  DeleteOutlined,
  UserOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useDeviceImport } from '@/contexts/DeviceImportContext';
import { usePatients } from '@/hooks/usePatients';
import { useCurrencies, useCreateMedicalRecord, useUploadAttachment } from '@/hooks/useMedicalRecords';
import { useAppSettings } from '@/hooks/useAppSettings';
import { CreateMedicalRecordInput } from '@/types/medical';
import styles from './DeviceImportModal.module.css';

const { TextArea } = Input;
const { Option } = Select;
const { Text } = Typography;

const DeviceImportModal: React.FC = () => {
  const { t } = useTranslation(['medical', 'common', 'forms']);
  const { notification, modal: modalHook } = App.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [recordType, setRecordType] = useState<'procedure' | 'note'>('note');

  const {
    pendingFiles,
    modalOpen,
    suggestedPatientId,
    removeDeviceFile,
    clearAllFiles,
    closeModal,
  } = useDeviceImport();

  const { patients } = usePatients();
  const { data: currencies } = useCurrencies();
  const { settings } = useAppSettings();
  const createMutation = useCreateMedicalRecord();
  const uploadMutation = useUploadAttachment();

  // Compute default form values based on device data
  const getDefaultFormValues = () => {
    const defaults: any = {
      recordType: 'note',
    };

    if (suggestedPatientId) {
      defaults.patientId = suggestedPatientId;
    }

    // Only set currency if user changes to procedure type
    if (recordType === 'procedure' && settings?.currencyId) {
      defaults.currencyId = settings.currencyId;
    }

    // Auto-fill name and description from device data
    if (pendingFiles.length > 0) {
      const deviceNames = [...new Set(pendingFiles.map(f => f.deviceName))].join(', ');
      defaults.name = `${deviceNames} - Device Data`;

      const fileList = pendingFiles.map(f => `${f.fileName} (${f.deviceName})`).join('\n  - ');
      defaults.description = `Device data imported from:\n  - ${fileList}\n\nDetected at: ${new Date(pendingFiles[0].detectedAt).toLocaleString()}`;
    }

    return defaults;
  };

  // Reset form with defaults when modal opens
  useEffect(() => {
    if (modalOpen) {
      const defaults = getDefaultFormValues();
      form.resetFields();
      form.setFieldsValue(defaults);
    }
  }, [modalOpen, suggestedPatientId, settings?.currencyId, pendingFiles]);

  const handleRecordTypeChange = (value: 'procedure' | 'note') => {
    setRecordType(value);
    if (value === 'note') {
      // Clear financial fields for notes
      form.setFieldValue('price', undefined);
      form.setFieldValue('currencyId', undefined);
    } else if (value === 'procedure') {
      // Set default currency for procedures
      if (settings?.currencyId) {
        form.setFieldValue('currencyId', settings.currencyId);
      }
    }
  };

  const handleRemoveFile = (fileId: string) => {
    removeDeviceFile(fileId);

    // If no files left, close modal
    if (pendingFiles.length === 1) {
      handleCancel();
    }
  };

  const handleCancel = () => {
    modalHook.confirm({
      title: t('common:confirm'),
      content: t('medical:deviceImport.confirmCancel'),
      onOk: () => {
        form.resetFields();
        clearAllFiles();
        closeModal();
      },
    });
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      console.log('💾 Creating medical record with', pendingFiles.length, 'files');
      pendingFiles.forEach((file, index) => {
        console.log(`   File ${index + 1}:`, {
          fileName: file.fileName,
          deviceName: file.deviceName,
          mimeType: file.mimeType,
          size: file.fileData.length,
        });
      });

      // Create medical record with device data from first file (for PDF generation)
      const firstFile = pendingFiles[0];
      const input: CreateMedicalRecordInput = {
        patientId: values.patientId,
        recordType: values.recordType,
        name: values.name,
        description: values.description,
        price: values.price,
        currencyId: values.currencyId,
        // Include device data for PDF generation (from first file)
        deviceTestData: firstFile?.testResults,
        deviceType: firstFile?.deviceType,
        deviceName: firstFile?.deviceName,
      };

      console.log('💾 Creating medical record with device data:', {
        hasDeviceData: !!firstFile?.testResults,
        deviceType: firstFile?.deviceType,
        deviceName: firstFile?.deviceName,
      });

      const createdRecord = await createMutation.mutateAsync(input);
      console.log('✅ Medical record created, ID:', createdRecord.id);

      // Upload all device files as attachments
      if (createdRecord && pendingFiles.length > 0) {
        console.log('📤 Starting upload of', pendingFiles.length, 'files...');

        const uploadPromises = pendingFiles.map((file, index) => {
          console.log(`   Uploading file ${index + 1}/${pendingFiles.length}:`, file.fileName);
          return uploadMutation.mutateAsync({
            medicalRecordId: createdRecord.id,
            file: new File([new Uint8Array(file.fileData)], file.fileName, {
              type: file.mimeType,
            }),
            deviceType: file.deviceType,
            deviceName: file.deviceName,
            connectionMethod: file.connectionMethod,
          });
        });

        try {
          const results = await Promise.all(uploadPromises);
          console.log('✅ All', results.length, 'files uploaded successfully');

          notification.success({
            message: t('common:success'),
            description: t('medical:deviceImport.successMessage', {
              count: pendingFiles.length,
            }),
            placement: 'bottomRight',
            duration: 5,
          });
        } catch (uploadError) {
          console.error('❌ Upload error:', uploadError);
          console.error('   Error details:', JSON.stringify(uploadError, null, 2));
          notification.warning({
            message: t('common:warning'),
            description: t('medical:deviceImport.partialSuccess'),
            placement: 'bottomRight',
            duration: 5,
          });
        }
      }

      // Clear and close
      form.resetFields();
      clearAllFiles();
      closeModal();
    } catch (error) {
      console.error('Save error:', error);
      notification.error({
        message: t('common:error'),
        description: t('medical:deviceImport.saveFailed'),
        placement: 'bottomRight',
        duration: 5,
      });
    } finally {
      setLoading(false);
    }
  };

  if (!modalOpen) {
    return null;
  }

  return (
    <Modal
      title={
        <Space>
          <FileOutlined />
          {t('medical:deviceImport.title')}
          <Tag color="blue">{pendingFiles.length} {t('medical:deviceImport.filesCount')}</Tag>
        </Space>
      }
      open={modalOpen}
      onCancel={handleCancel}
      footer={null}
      width={900}
      destroyOnClose
    >
      {/* Pending Files List */}
      <Card
        size="small"
        title={t('medical:deviceImport.pendingFiles')}
        style={{ marginBottom: 16 }}
      >
        <List
          dataSource={pendingFiles}
          renderItem={(file) => (
            <List.Item
              actions={[
                <Button
                  key="remove"
                  type="text"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => handleRemoveFile(file.id)}
                >
                  {t('common:remove')}
                </Button>,
              ]}
            >
              <List.Item.Meta
                avatar={<FileOutlined style={{ fontSize: 24 }} />}
                title={
                  <Space>
                    <Text strong>{file.fileName}</Text>
                    <Tag color="green">{file.deviceName}</Tag>
                    {file.patientId && (
                      <Tag color="blue" icon={<CheckCircleOutlined />}>
                        {t('medical:deviceImport.patientDetected')}
                      </Tag>
                    )}
                  </Space>
                }
                description={
                  <Space direction="vertical" size={0}>
                    <Text type="secondary">
                      {new Date(file.detectedAt).toLocaleString()}
                    </Text>
                    {file.patientIdentifier && (
                      <Text type="secondary">
                        {t('medical:deviceImport.identifier')}: {file.patientIdentifier}
                      </Text>
                    )}
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      </Card>

      <Divider>{t('medical:deviceImport.medicalRecordDetails')}</Divider>

      {/* Medical Record Form */}
      <Form
        form={form}
        layout="vertical"
      >
        <Form.Item
          name="patientId"
          label={t('medical:deviceImport.selectPatient')}
          rules={[{ required: true, message: t('forms:validation.required') }]}
        >
          <Select
            placeholder={t('medical:deviceImport.selectPatientPlaceholder')}
            showSearch
            optionFilterProp="children"
            suffixIcon={<UserOutlined />}
            size="large"
          >
            {patients?.map((patient: any) => (
              <Option key={patient.id} value={patient.id}>
                {patient.name} - {patient.species}
              </Option>
            ))}
          </Select>
        </Form.Item>

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

        <Form.Item
          name="name"
          label={
            recordType === 'procedure'
              ? t('medical:fields.procedureName')
              : t('medical:fields.title')
          }
          rules={[
            { required: true, message: t('forms:validation.required') },
            { max: 200, message: t('forms:validation.maxLength', { max: 200 }) },
          ]}
          tooltip="Auto-filled from device data - you can edit if needed"
        >
          <Input
            placeholder={
              recordType === 'procedure'
                ? t('medical:placeholders.procedureName')
                : t('medical:placeholders.noteTitle')
            }
          />
        </Form.Item>

        <Form.Item
          name="description"
          label={t('medical:fields.description')}
          rules={[{ required: true, message: t('forms:validation.required') }]}
          tooltip="Auto-filled from device data - you can edit if needed"
        >
          <TextArea
            rows={6}
            placeholder={t('medical:placeholders.description')}
            showCount
            maxLength={5000}
          />
        </Form.Item>

        {recordType === 'procedure' && (
          <Space size="middle" style={{ width: '100%' }}>
            <Form.Item name="price" label={t('medical:fields.price')} style={{ flex: 1 }}>
              <InputNumber
                min={0}
                precision={2}
                placeholder="0.00"
                style={{ width: '100%' }}
              />
            </Form.Item>

            <Form.Item name="currencyId" label={t('medical:fields.currency')} style={{ flex: 1 }}>
              <Select placeholder={t('common:selectPlaceholder')} allowClear>
                {currencies?.map((currency) => (
                  <Option key={currency.id} value={currency.id}>
                    {currency.symbol} {currency.code}
                  </Option>
                ))}
              </Select>
            </Form.Item>
          </Space>
        )}

        <Form.Item style={{ marginTop: 24, marginBottom: 0 }}>
          <Space>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              icon={<SaveOutlined />}
              onClick={handleSubmit}
            >
              {t('common:buttons.create')}
            </Button>
            <Button onClick={handleCancel} icon={<CloseOutlined />}>
              {t('common:buttons.cancel')}
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default DeviceImportModal;
