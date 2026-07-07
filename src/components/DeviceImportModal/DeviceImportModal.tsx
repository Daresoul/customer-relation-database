/**
 * DeviceImportModal - Modal for importing device data as medical records
 *
 * Refactored to use MedicalRecordFieldGroup for reusable field definitions.
 */

import React, { useState, useEffect, useRef } from 'react';
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
  App,
  Tag,
  Card,
  Drawer,
  Checkbox,
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
import { useCreateMedicalRecord, useUploadAttachment } from '@/hooks/useMedicalRecords';
import { useSearchRecordTemplates } from '@/hooks/useRecordTemplates';
import { useAppSettings } from '@/hooks/useAppSettings';
import { useDebounce } from '@/hooks/useDebounce';
import { CreateMedicalRecordInput } from '@/types/medical';
import { Patient } from '@/types';
import type { MedicalRecordLineItem, CreateLineItemInput } from '@/types/lineItem';
import { MedicalService } from '@/services/medicalService';
import { fileHistoryService } from '@/services/fileHistoryService';
import RecentDeviceFiles from '../RecentDeviceFiles';
import CreatePatientSection from './CreatePatientSection';
import { TabbedMedicalRecordFields } from '@/components/forms/fieldGroups';
import type { RecordType, RecordTemplate } from '@/components/forms/fieldGroups';
import styles from './DeviceImportModal.module.css';
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner';
import { listen } from '@tauri-apps/api/event';

const { Option } = Select;
const { Text } = Typography;

const DeviceImportModal: React.FC = () => {
  const { t } = useTranslation(['medical', 'common', 'forms']);
  const { notification, modal: modalHook } = App.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [recordType, setRecordType] = useState<RecordType>('test_result');
  const [recentFilesDrawerOpen, setRecentFilesDrawerOpen] = useState(false);
  const [createPatientExpanded, setCreatePatientExpanded] = useState(false);
  const [printAfterSave, setPrintAfterSave] = useState(true);
  const [patientSerial, setPatientSerial] = useState<string>('');
  const [scannedMicrochipId, setScannedMicrochipId] = useState<string>('');
  const [titleSearchTerm, setTitleSearchTerm] = useState<string>('');
  const debouncedSearchTerm = useDebounce(titleSearchTerm, 300);
  // Component-level dedup: prevent double-fire from keyboard wedge + HID event for same scan
  const lastProcessedScanRef = useRef<{ code: string; time: number } | null>(null);

  // Line items state
  const [lineItems, setLineItems] = useState<MedicalRecordLineItem[]>([]);
  const [discountPercent, setDiscountPercent] = useState<number | undefined>();
  const [manualTotal, setManualTotal] = useState<number | undefined>();
  // Validation error field names from the most recent submit attempt.
  // Passed down to TabbedMedicalRecordFields so it can surface which
  // tab needs attention. Cleared on successful submit and as the user
  // edits the offending field.
  const [errorFields, setErrorFields] = useState<string[]>([]);

  const {
    modalOpen,
    suggestedPatientId,
    addDeviceFile,
    removeDeviceFile,
    clearAllFiles,
    closeModal,
    getGroupedFiles,
    getAggregatedPatientData,
    getPatientDataConflicts,
  } = useDeviceImport();

  const pendingFiles = getGroupedFiles();
  const { patients, refreshPatients, loading: patientsLoading } = usePatients();

  // Prefill the "save for later" serial once — from the matched patient's name or
  // the device-supplied identifier — so staff don't retype what we already know.
  const firstIdentifier = pendingFiles[0]?.patientIdentifier;
  useEffect(() => {
    if (patientSerial.trim()) return; // never clobber manual entry
    const matched = suggestedPatientId ? patients.find((p) => p.id === suggestedPatientId) : undefined;
    const prefill = matched?.name || firstIdentifier || '';
    if (prefill) setPatientSerial(prefill);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestedPatientId, firstIdentifier, patients]);
  const { settings } = useAppSettings();
  const createMutation = useCreateMedicalRecord();
  const uploadMutation = useUploadAttachment();
  const { data: searchedTemplates, isLoading: isSearchingTemplates } = useSearchRecordTemplates(debouncedSearchTerm, recordType);

  // Shared handler for processing a scanned microchip code from any source.
  // Caller has already validated and normalized to the canonical 15-digit form.
  const handleScanCode = (code: string) => {
    // Component-level dedup: prevent double-fire from keyboard wedge + HID event
    const now = Date.now();
    if (
      lastProcessedScanRef.current &&
      lastProcessedScanRef.current.code === code &&
      now - lastProcessedScanRef.current.time < 500
    ) {
      return;
    }
    lastProcessedScanRef.current = { code, time: now };

    setPatientSerial(code);

    // Look up an existing patient by microchip ID. If found, auto-select.
    // If not, open the create-patient section and prefill the chip ID so the
    // vet can fill the rest of the form without retyping the number.
    const matched = patients.find(p => p.microchipId === code);
    if (matched) {
      form.setFieldValue('patientId', matched.id);
      notification.success({
        message: t('medical:deviceImport.patientMatched', 'Patient matched'),
        description: `${matched.name} — ${code}`,
        placement: 'bottomRight',
        duration: 2,
      });
      return;
    }

    setScannedMicrochipId(code);
    setCreatePatientExpanded(true);
    notification.info({
      message: t('medical:deviceImport.noPatientMatch', 'No patient found'),
      description: t(
        'medical:deviceImport.noPatientMatchDesc',
        'Create a new patient — microchip ID has been prefilled.'
      ),
      placement: 'bottomRight',
      duration: 3,
    });
  };

  // Capture barcode scans via keyboard wedge detection
  useBarcodeScanner({
    suffixKey: 'Enter',
    minLength: 8,
    interKeyDelay: 50,
    finalizeTimeout: 100,
    onScan: handleScanCode,
  });

  // React to HID scan events (both wake-from-tray and scanner:barcode)
  useEffect(() => {
    let unlistenWake: (() => void) | undefined;
    let unlistenBarcode: (() => void) | undefined;
    const setup = async () => {
      // wake-from-tray fires when the window was hidden and a scan brought it back
      unlistenWake = await listen<any>('wake-from-tray', (event) => {
        const payload = event.payload || {};
        if (payload.cause === 'scan' && payload.code) {
          handleScanCode(String(payload.code));
        }
      });
      // scanner:barcode fires for every HID scan regardless of window visibility
      unlistenBarcode = await listen<any>('scanner:barcode', (event) => {
        const payload = event.payload || {};
        if (payload.code) {
          handleScanCode(String(payload.code));
        }
      });
    };
    setup();
    return () => {
      if (unlistenWake) unlistenWake();
      if (unlistenBarcode) unlistenBarcode();
    };
  }, [patients, form]);

  // Compute default form values based on device data
  const getDefaultFormValues = () => {
    const defaults: any = {
      recordType: 'test_result',
    };

    if (suggestedPatientId) {
      defaults.patientId = suggestedPatientId;
    }

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
      refreshPatients();
    }
  }, [modalOpen]);

  // Reset form with defaults when modal opens or relevant data changes
  useEffect(() => {
    if (modalOpen) {
      const defaults = getDefaultFormValues();
      form.resetFields();
      form.setFieldsValue(defaults);
    }
  }, [modalOpen, suggestedPatientId, pendingFiles.length]);

  const handleRecordTypeChange = (value: RecordType) => {
    setRecordType(value);
    setTitleSearchTerm('');
  };

  const handleTemplateSelect = (template: RecordTemplate) => {
    // Template fields are already set by MedicalRecordFieldGroup
    // This callback is for any additional logic if needed
  };

  const handleRemoveFile = (fileId: string) => {
    removeDeviceFile(fileId);
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
        setScannedMicrochipId('');
        setLineItems([]);
        setDiscountPercent(undefined);
        setManualTotal(undefined);
        clearAllFiles();
        closeModal();
      },
    });
  };

  const handleAddRecentFile = async (fileId: string, originalName: string) => {
    try {
      // Pull the stored file's bytes + device metadata back from history and add
      // it to the current import as a pending file, so it flows through the same
      // create/attach path as a freshly-received result.
      const dl = await fileHistoryService.downloadDeviceFile(fileId);
      addDeviceFile({
        id: `recent-${fileId}-${Date.now()}`,
        deviceType: dl.deviceType,
        deviceName: dl.deviceName,
        connectionMethod: dl.connectionMethod || 'file_history',
        fileName: dl.fileName,
        fileData: dl.fileData,
        mimeType: dl.mimeType,
        testResults: dl.testResults,
        patientIdentifier: undefined,
        detectedAt: new Date().toISOString(),
      });
      notification.success({
        message: t('common:success'),
        description: `Added "${originalName}" to this import.`,
        placement: 'bottomRight',
        duration: 3,
      });
      setRecentFilesDrawerOpen(false);
    } catch (e: any) {
      console.error('Add recent file failed:', e);
      notification.error({
        message: t('common:error'),
        description: e?.message || `Failed to add "${originalName}"`,
        placement: 'bottomRight',
      });
    }
  };

  const handleSaveForLater = async () => {
    if (!patientSerial || patientSerial.trim().length === 0) {
      notification.warning({ message: t('common:warning'), description: 'Please enter a patient serial to save for later', placement: 'bottomRight' });
      return;
    }
    try {
      setLoading(true);
      const filesMeta = pendingFiles.map((f) => ({
        originalName: f.fileName,
        fileSize: f.fileData?.length,
      }));
      const savedCount = await fileHistoryService.saveDeviceFilesForLater(patientSerial.trim(), filesMeta, pendingFiles[0]?.patientIdentifier);
      notification.success({ message: t('common:success'), description: `Saved ${savedCount} file(s) for later under serial '${patientSerial}'.`, placement: 'bottomRight' });
      form.resetFields();
      setCreatePatientExpanded(false);
      setLineItems([]);
      setDiscountPercent(undefined);
      setManualTotal(undefined);
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
    refreshPatients();
    form.setFieldValue('patientId', patient.id);
    setCreatePatientExpanded(false);
    setScannedMicrochipId('');
  };

  const handleSubmit = async () => {
    let values: any;
    try {
      values = await form.validateFields();
    } catch (err: any) {
      // AntD rejects with { errorFields: [{ name: ['fieldName'], errors: [...] }] }
      // on validation failure. Capture the field names so the tabbed
      // component can flag the right tab and switch to it — otherwise
      // the user clicks Create on (say) Line Items, the validation
      // error is on Description over in Standard, and nothing visible
      // happens.
      if (err?.errorFields && Array.isArray(err.errorFields)) {
        const names = err.errorFields.map((e: any) =>
          Array.isArray(e.name) ? e.name.join('.') : String(e.name),
        );
        setErrorFields(names);
        notification.error({
          message: t('common:error'),
          description: t(
            'medical:messages.validationFailed',
            'Please fill in the required fields highlighted in red.',
          ),
          placement: 'bottomRight',
          duration: 4,
        });
      }
      return;
    }
    if (errorFields.length > 0) setErrorFields([]);
    try {
      setLoading(true);

      const deviceDataList = pendingFiles.map(file => ({
        deviceTestData: file.testResults,
        deviceType: file.deviceType,
        deviceName: file.deviceName,
      }));

      // Convert line items for submission
      const lineItemsInput: CreateLineItemInput[] | undefined = lineItems.length > 0
        ? lineItems.map(item => ({
            templateId: item.templateId,
            name: item.name,
            description: item.description,
            unitPrice: item.unitPrice,
            currencyId: item.currencyId,
            quantity: item.quantity,
          }))
        : undefined;

      const input: CreateMedicalRecordInput = {
        patientId: values.patientId,
        recordType: values.recordType,
        name: values.name,
        description: values.description,
        prescriptionNotes: values.prescriptionNotes,
        deviceDataList,
        discountPercent: discountPercent,
        manualTotal: manualTotal,
        lineItems: lineItemsInput,
      };

      const createdRecord = await createMutation.mutateAsync(input);

      if (createdRecord && pendingFiles.length > 0) {
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
          console.warn('Attachment upload failures:', failures);
        }

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

      form.resetFields();
      setCreatePatientExpanded(false);
      setScannedMicrochipId('');
      setLineItems([]);
      setDiscountPercent(undefined);
      setManualTotal(undefined);
      clearAllFiles();
      closeModal();

      // Navigate to the newly created medical record
      if (createdRecord?.id) {
        window.location.href = `/medical-records/${createdRecord.id}`;
      }
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
        // Drop a field from errorFields the moment the user starts
        // editing it — keeps the red tab-indicator from sticking
        // around after the offending field is fixed.
        onValuesChange={(changed) => {
          if (errorFields.length === 0) return;
          const changedNames = Object.keys(changed);
          const remaining = errorFields.filter((f) => !changedNames.includes(f));
          if (remaining.length !== errorFields.length) setErrorFields(remaining);
        }}
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
            data-testid="device-import-patient-select"
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
          prefillMicrochipId={scannedMicrochipId}
        />

        {/* Medical Record Fields using tabbed component */}
        <TabbedMedicalRecordFields
          form={form}
          recordType={recordType}
          onRecordTypeChange={handleRecordTypeChange}
          templates={searchedTemplates}
          isSearchingTemplates={isSearchingTemplates}
          onTemplateSearch={setTitleSearchTerm}
          onTemplateSelect={handleTemplateSelect}
          hideRecordType={false}
          lineItems={lineItems}
          onLineItemsChange={setLineItems}
          discountPercent={discountPercent}
          onDiscountChange={setDiscountPercent}
          manualTotal={manualTotal}
          onManualTotalChange={setManualTotal}
          showLineItemsBadge={lineItems.length > 0}
          lineItemsCount={lineItems.length}
          errorFields={errorFields}
        />

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
              data-testid="device-import-submit-btn"
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
        destroyOnHidden
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
