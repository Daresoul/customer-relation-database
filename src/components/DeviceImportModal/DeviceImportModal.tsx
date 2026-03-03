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
  Checkbox,
  AutoComplete,
  Spin,
} from 'antd';
import {
  SaveOutlined,
  CloseOutlined,
  FileOutlined,
  DeleteOutlined,
  UserOutlined,
  CheckCircleOutlined,
  HistoryOutlined,
  PrinterOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useDeviceImport } from '@/contexts/DeviceImportContext';
import { usePatients } from '@/hooks/usePatients';
import { useCurrencies, useCreateMedicalRecord, useUploadAttachment } from '@/hooks/useMedicalRecords';
import { useSearchRecordTemplates } from '@/hooks/useRecordTemplates';
import { useAppSettings } from '@/hooks/useAppSettings';
import { useDebounce } from '@/hooks/useDebounce';
import { CreateMedicalRecordInput } from '@/types/medical';
import { Patient } from '@/types';
import { MedicalService } from '@/services/medicalService';
import { fileHistoryService } from '@/services/fileHistoryService';
import RecentDeviceFiles from '../RecentDeviceFiles';
import CreatePatientSection from './CreatePatientSection';
import styles from './DeviceImportModal.module.css';
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner';
import { listen } from '@tauri-apps/api/event';

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
  const [createPatientExpanded, setCreatePatientExpanded] = useState(false);
  const [printAfterSave, setPrintAfterSave] = useState(true); // Default to printing after save
  const [patientSerial, setPatientSerial] = useState<string>('');
  const [titleSearchTerm, setTitleSearchTerm] = useState<string>('');
  const debouncedSearchTerm = useDebounce(titleSearchTerm, 300);
  // full patient modal removed per request; keep inline create only

  const {
    modalOpen,
    suggestedPatientId,
    removeDeviceFile,
    clearAllFiles,
    closeModal,
    getGroupedFiles,
    getAggregatedPatientData,
    getPatientDataConflicts,
  } = useDeviceImport();

  // Get grouped files (sessions + individual files)
  const pendingFiles = getGroupedFiles();

  const { patients, refreshPatients, loading: patientsLoading } = usePatients();
  const { data: currencies } = useCurrencies();
  const { settings } = useAppSettings();
  const createMutation = useCreateMedicalRecord();
  const uploadMutation = useUploadAttachment();
  const { data: searchedTemplates, isLoading: isSearchingTemplates } = useSearchRecordTemplates(debouncedSearchTerm, recordType);

  // Capture barcode scans without interfering with typing
  useBarcodeScanner({
    // Configure a prefix if your scanners can be set to one (recommended)
    // prefix: 'SCN-',
    suffixKey: 'Enter',
    minLength: 8,
    interKeyDelay: 12,
    finalizeTimeout: 100,
    onScan: (code) => {
      // Only populate serial automatically if it looks like a microchip (15 or legacy 10 digits)
      const isMicrochip = /^(\d{15}|\d{10})$/.test(code);
      if (!isMicrochip) return;
      // Example behavior in Device Import modal:
      // - Set the "Save for later" serial field
      // - If the patient select is empty and code is numeric, try to set it directly
      setPatientSerial(code);
      // Optionally, auto-select patient if code is numeric ID and exists in list
      const numericId = Number(code);
      if (!Number.isNaN(numericId)) {
        const found = patients.find(p => p.id === numericId);
        if (found) {
          form.setFieldValue('patientId', found.id);
        }
      }
      notification.success({
        message: t('medical:deviceImport.scanDetected', 'Scan detected'),
        description: code,
        placement: 'bottomRight',
        duration: 2,
      });
    }
  });

  // Also react to HID/serial scan wake events
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    const setup = async () => {
      unlisten = await listen<any>('wake-from-tray', (event) => {
        const payload = event.payload || {};
        if (payload.cause === 'scan' && payload.code) {
          setPatientSerial(String(payload.code));
          // Try to auto-select patient if numeric id
          const num = Number(payload.code);
          if (!Number.isNaN(num)) {
            const found = patients.find(p => p.id === num);
            if (found) {
              form.setFieldValue('patientId', found.id);
            }
          }
        }
      });
    };
    setup();
    return () => { if (unlisten) unlisten(); };
  }, [patients, form]);

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
    setTitleSearchTerm(''); // Reset search when type changes
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

  const handleTemplateSelect = (value: string) => {
    // Find the selected template
    const template = searchedTemplates?.find(t => t.title === value);
    if (template) {
      // Auto-fill form fields from template
      form.setFieldsValue({
        name: template.title,
        description: template.description,
        price: template.price,
        currencyId: template.currencyId,
      });
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
        setCreatePatientExpanded(false);
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

  // Save for later: associate pending files with a patient serial for later processing
  const handleSaveForLater = async () => {
    if (!patientSerial || patientSerial.trim().length === 0) {
      notification.warning({ message: t('common:warning'), description: 'Please enter a patient serial to save for later', placement: 'bottomRight' });
      return;
    }
    try {
      setLoading(true);
      // Build file metadata array from pending files
      const filesMeta = pendingFiles.map((f) => ({
        originalName: f.fileName,
        fileSize: f.fileData?.length,
      }));
      const savedCount = await fileHistoryService.saveDeviceFilesForLater(patientSerial.trim(), filesMeta, pendingFiles[0]?.patientIdentifier);
      notification.success({ message: t('common:success'), description: `Saved ${savedCount} file(s) for later under serial '${patientSerial}'.`, placement: 'bottomRight' });
      // Clear and close
      form.resetFields();
      setCreatePatientExpanded(false);
      clearAllFiles();
      closeModal();
    } catch (e: any) {
      console.error('Save for later failed:', e);
      notification.error({ message: t('common:error'), description: e?.message || 'Failed to save for later', placement: 'bottomRight' });
    } finally {
      setLoading(false);
    }
  };

  const handlePatientCreated = (patient: Patient) => {
    // Refresh patients list to include the new patient
    refreshPatients();
    // Auto-select the newly created patient
    form.setFieldValue('patientId', patient.id);
    // Collapse the create patient section
    setCreatePatientExpanded(false);
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
        // Upload each pending file, capturing per-file success/failure
        const tasks = pendingFiles.map((file) =>
          uploadMutation
            .mutateAsync({
              medicalRecordId: createdRecord.id,
              file: new File([new Uint8Array(file.fileData)], file.fileName, {
                type: file.mimeType,
              }),
              deviceType: file.deviceType,
              deviceName: file.deviceName,
              connectionMethod: file.connectionMethod,
              attachmentType: 'test_result',
              sourceFileId: file.sourceFileId,
            })
            .then((res: any) => ({ status: 'fulfilled' as const, fileName: file.fileName, value: res }))
            .catch((err: any) => ({ status: 'rejected' as const, fileName: file.fileName, reason: err }))
        );

        const results = await Promise.all(tasks);
        const successes = results.filter(r => r.status === 'fulfilled') as Array<{status: 'fulfilled'; fileName: string; value: any}>;
        const failures = results.filter(r => r.status === 'rejected') as Array<{status: 'rejected'; fileName: string; reason: any}>;

        if (successes.length > 0) {
          notification.success({
            message: t('common:success'),
            description: `${successes.length}/${pendingFiles.length} files uploaded` + (failures.length ? `, ${failures.length} failed` : ''),
            placement: 'bottomRight',
            duration: 3,
          });

          // Mark any "saved for later" entries as processed now that at least one attachment succeeded
          try {
            const uniquePendingIds = Array.from(new Set(pendingFiles.map(f => f.pendingEntryId).filter(Boolean))) as number[];
            await Promise.all(uniquePendingIds.map(id => fileHistoryService.markPendingEntryProcessed(id)));
          } catch (e) {
            console.warn('Failed to mark some pending entries processed:', e);
          }
        }

        if (failures.length > 0) {
          const lines = failures.slice(0, 5).map(f => `• ${f.fileName}: ${f?.reason?.message || String(f.reason)}`).join('\n');
          notification.warning({
            message: t('medical:deviceImport.partialSuccess', 'Some files failed to upload'),
            description: lines,
            placement: 'bottomRight',
            duration: 6,
          });
          // Log full failures to console for diagnostics
          console.warn('Attachment upload failures:', failures);
        }

        // Generate and open PDF if at least one attachment succeeded
        const attachmentIds = successes.map(s => s.value?.id).filter(Boolean);
        if (printAfterSave && attachmentIds.length > 0) {
          const autoOpenReport = (typeof window !== 'undefined') && localStorage.getItem('autoOpenGeneratedReport') === 'true';
          const regenerate = async () => {
            try {
              const pdfAttachment = await MedicalService.generateConfiguredReport(createdRecord.id, attachmentIds, {});
              if (pdfAttachment?.id && autoOpenReport) {
                await MedicalService.openAttachmentExternally(pdfAttachment.id);
              }
            } catch (e) {
              console.error('Regenerate PDF failed:', e);
              notification.warning({
                message: t('medical:deviceImport.pdfGenerationFailed', 'PDF Generation Failed'),
                description: t('medical:deviceImport.pdfGenerationFailedDesc', 'The record was saved but PDF generation failed. You can regenerate it from the medical record view.'),
                placement: 'bottomRight',
              });
            }
          };

          try {
            notification.info({
              message: t('medical:deviceImport.generatingPdf', 'Generating PDF...'),
              description: t('medical:deviceImport.pleaseWait', 'Please wait while the report is being generated.'),
              placement: 'bottomRight',
              duration: 2,
            });
            const pdfAttachment = await MedicalService.generateConfiguredReport(createdRecord.id, attachmentIds, {});
            if (pdfAttachment?.id && autoOpenReport) {
              await MedicalService.openAttachmentExternally(pdfAttachment.id);
            }
            // Offer an immediate re-generate link
            notification.open({
              message: t('medical:deviceImport.pdfReady', 'PDF Ready'),
              description: t('medical:deviceImport.pdfReadyDesc', 'Click to regenerate if needed.'),
              placement: 'bottomRight',
              btn: (
                <Button size="small" type="primary" onClick={regenerate}>
                  {t('medical:deviceImport.regenerate', 'Regenerate PDF')}
                </Button>
              ),
            });
          } catch (pdfError) {
            console.error('Failed to generate PDF report:', pdfError);
            notification.warning({
              message: t('medical:deviceImport.pdfGenerationFailed', 'PDF Generation Failed'),
              description: t('medical:deviceImport.pdfGenerationFailedDesc', 'The record was saved but PDF generation failed. You can regenerate it from the medical record view.'),
              placement: 'bottomRight',
              duration: 5,
            });
          }
        }
      }

      // Clear and close
      form.resetFields();
      setCreatePatientExpanded(false);
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
      styles={{ body: { paddingBottom: 32 } }}
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

      {/* Save for later controls */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input
            placeholder="Patient serial / reference"
            value={patientSerial}
            onChange={(e) => setPatientSerial(e.target.value)}
            style={{ width: 300 }}
          />
          <Button onClick={handleSaveForLater} disabled={pendingFiles.length === 0}>
            Save for later
          </Button>
        </Space>
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

        {/* Inline Patient Creation Section */}
        <CreatePatientSection
          extractedData={getAggregatedPatientData()}
          conflicts={getPatientDataConflicts()}
          onPatientCreated={handlePatientCreated}
          onCancel={() => setCreatePatientExpanded(false)}
          isExpanded={createPatientExpanded}
          onToggleExpand={setCreatePatientExpanded}
        />


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
          <AutoComplete
            options={searchedTemplates?.map(template => ({
              value: template.title,
              label: (
                <div>
                  <div style={{ fontWeight: 500 }}>{template.title}</div>
                  <div style={{ fontSize: '12px', color: '#888' }}>
                    {template.description && template.description.length > 60
                      ? template.description.substring(0, 60) + '...'
                      : template.description || ''}
                  </div>
                </div>
              ),
            }))}
            onSearch={setTitleSearchTerm}
            onSelect={handleTemplateSelect}
            placeholder={
              recordType === 'procedure'
                ? t('medical:placeholders.procedureName')
                : t('medical:placeholders.noteTitle')
            }
            filterOption={false}
            notFoundContent={
              isSearchingTemplates ? <Spin size="small" /> :
              debouncedSearchTerm.length < 2 ? t('medical:autocomplete.typeToSearch') || 'Type at least 2 characters to search' :
              searchedTemplates?.length === 0 ? t('medical:autocomplete.noTemplatesFound') || 'No templates found' :
              null
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

        <Form.Item style={{ marginTop: 16, marginBottom: 16 }}>
          <Checkbox
            checked={printAfterSave}
            onChange={(e) => setPrintAfterSave(e.target.checked)}
          >
            <Space>
              <PrinterOutlined />
              {t('medical:deviceImport.printAfterSave', 'Generate and print PDF report after saving')}
            </Space>
          </Checkbox>
        </Form.Item>

        <Form.Item style={{ marginTop: 24, marginBottom: 24 }}>
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
