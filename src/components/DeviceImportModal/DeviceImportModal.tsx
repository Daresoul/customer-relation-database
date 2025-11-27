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
  Drawer,
} from 'antd';
import {
  SaveOutlined,
  CloseOutlined,
  FileOutlined,
  DeleteOutlined,
  UserOutlined,
  CheckCircleOutlined,
  HistoryOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useDeviceImport } from '@/contexts/DeviceImportContext';
import { usePatients } from '@/hooks/usePatients';
import { useCurrencies, useCreateMedicalRecord, useUploadAttachment } from '@/hooks/useMedicalRecords';
import { useAppSettings } from '@/hooks/useAppSettings';
import { CreateMedicalRecordInput } from '@/types/medical';
import RecentDeviceFiles from '../RecentDeviceFiles';
import styles from './DeviceImportModal.module.css';

const { TextArea } = Input;
const { Option } = Select;
const { Text } = Typography;

const DeviceImportModal: React.FC = () => {
  const { t } = useTranslation(['medical', 'common', 'forms']);
  const { notification, modal: modalHook } = App.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [recordType, setRecordType] = useState<'procedure' | 'note' | 'test_result'>('test_result');
  const [recentFilesDrawerOpen, setRecentFilesDrawerOpen] = useState(false);

  const {
    modalOpen,
    suggestedPatientId,
    removeDeviceFile,
    clearAllFiles,
    closeModal,
    getGroupedFiles,
  } = useDeviceImport();

  // Get grouped files (sessions + individual files)
  const pendingFiles = getGroupedFiles();

  const { patients, refreshPatients, loading: patientsLoading } = usePatients();
  const { data: currencies } = useCurrencies();
  const { settings } = useAppSettings();
  const createMutation = useCreateMedicalRecord();
  const uploadMutation = useUploadAttachment();

  // Compute default form values based on device data
  const getDefaultFormValues = () => {
    const defaults: any = {
      recordType: 'test_result',
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

  // Refresh patients list when modal opens
  useEffect(() => {
    if (modalOpen) {
      // Refresh patients to get latest list (in case new patients were created)
      refreshPatients();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalOpen]);

  // Reset form with defaults when modal opens or relevant data changes
  useEffect(() => {
    if (modalOpen) {
      const defaults = getDefaultFormValues();
      form.resetFields();
      form.setFieldsValue(defaults);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalOpen, suggestedPatientId, settings?.currencyId, pendingFiles.length]);

  const handleRecordTypeChange = (value: 'procedure' | 'note' | 'test_result') => {
    setRecordType(value);
    if (value === 'note' || value === 'test_result') {
      // Clear financial fields for notes and test results
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

  const handleAddRecentFile = (fileId: string, originalName: string) => {
    notification.info({
      message: 'Recent File Selected',
      description: `Selected file: ${originalName}. This feature will be fully implemented to add the file to the pending list.`,
      placement: 'bottomRight',
      duration: 4,
    });
    setRecentFilesDrawerOpen(false);
    // TODO: Implement adding the file to the pending files list
    // This would require fetching the file from storage and adding it to the DeviceImportContext
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      // Create medical record with ALL device data for multi-device PDF generation
      const deviceDataList = pendingFiles.map(file => ({
        deviceTestData: file.testResults,
        deviceType: file.deviceType,
        deviceName: file.deviceName,
      }));

      const input: CreateMedicalRecordInput = {
        patientId: values.patientId,
        recordType: values.recordType,
        name: values.name,
        description: values.description,
        price: values.price,
        currencyId: values.currencyId,
        // Send all device data for multi-device PDF generation
        deviceDataList,
      };

      const createdRecord = await createMutation.mutateAsync(input);

      // Upload all device files as attachments
      if (createdRecord && pendingFiles.length > 0) {
        const uploadPromises = pendingFiles.map((file) => {
          return uploadMutation.mutateAsync({
            medicalRecordId: createdRecord.id,
            file: new File([new Uint8Array(file.fileData)], file.fileName, {
              type: file.mimeType,
            }),
            deviceType: file.deviceType,
            deviceName: file.deviceName,
            connectionMethod: file.connectionMethod,
            attachmentType: 'test_result', // Device files are test results, not regular files
          });
        });

        try {
          await Promise.all(uploadPromises);

          notification.success({
            message: t('common:success'),
            description: t('medical:deviceImport.successMessage', {
              count: pendingFiles.length,
            }),
            placement: 'bottomRight',
            duration: 5,
          });
        } catch (_uploadError) {
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
    } catch (_error) {
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
    >
      {/* Pending Files List */}
      <Card
        size="small"
        title={t('medical:deviceImport.pendingFiles')}
        extra={
          <Button
            type="link"
            icon={<HistoryOutlined />}
            onClick={() => setRecentFilesDrawerOpen(true)}
          >
            Browse Recent Files
          </Button>
        }
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
                    {file.isSession && (
                      <>
                        <Tag color="purple">
                          {t('medical:deviceImport.parameter', { count: file.parameterCount })}
                        </Tag>
                        {file.sessionInProgress && (
                          <Tag color="orange">{t('medical:deviceImport.sessionInProgress')}</Tag>
                        )}
                      </>
                    )}
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
                    {file.isSession && file.testResults && (
                      <Text type="secondary" style={{ fontSize: '0.85em' }}>
                        {Object.keys(file.testResults).join(', ')}
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
            loading={patientsLoading}
            notFoundContent={patientsLoading ? t('medical:deviceImport.loadingPatients') : t('medical:deviceImport.noPatientsFound')}
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
            <Option value="test_result">{t('medical:recordTypes.testResult')}</Option>
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
          tooltip={t('medical:deviceImport.autoFilledTooltip')}
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
          tooltip={t('medical:deviceImport.autoFilledTooltip')}
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

      {/* Recent Files Drawer */}
      <Drawer
        title="Recent Device Files (Last 14 Days)"
        placement="right"
        width={800}
        onClose={() => setRecentFilesDrawerOpen(false)}
        open={recentFilesDrawerOpen}
        destroyOnClose
      >
        <RecentDeviceFiles
          days={14}
          onAddToRecord={handleAddRecentFile}
        />
      </Drawer>
    </Modal>
  );
};

export default DeviceImportModal;
