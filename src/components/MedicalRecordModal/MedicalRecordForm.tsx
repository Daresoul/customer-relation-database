/**
 * MedicalRecordForm - Form for creating and editing medical records
 *
 * Refactored to use MedicalRecordFieldGroup for reusable field definitions.
 */

import React, { useState, useEffect } from 'react';
import { Form, Button, Space, Divider, Typography, Upload, Drawer, App, Select, Tag } from 'antd';
import { SaveOutlined, CloseOutlined, InboxOutlined, HistoryOutlined, TagsOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { invoke } from '@/services/invoke';
import FileUpload from '../FileUpload/FileUpload';
import FileAttachmentList from '../FileUpload/FileAttachmentList';
import RecentDeviceFiles from '../RecentDeviceFiles';
import { useMedicalRecord } from '@/hooks/useMedicalRecords';
import { useSearchRecordTemplates } from '@/hooks/useRecordTemplates';
import { useAppSettings } from '@/hooks/useAppSettings';
import { useDebounce } from '@/hooks/useDebounce';
import { MedicalService } from '@/services/medicalService';
import { TabbedMedicalRecordFields } from '@/components/forms/fieldGroups';
import type { MedicalRecord, CreateMedicalRecordInput, UpdateMedicalRecordInput, RecordTemplate, DeviceDataInput } from '@/types/medical';
import type { MedicalRecordLineItem, CreateLineItemInput } from '@/types/lineItem';
import type { RecordType } from '@/components/forms/fieldGroups';
import type { UploadFile } from 'antd';
import styles from './MedicalRecordForm.module.css';

const { Text } = Typography;
const { Dragger } = Upload;

/**
 * Local "Diagnosis" shape — mirrors the auto-generated TS type from the
 * Rust model but with the camelCase serde rename applied. Kept local so
 * the form doesn't pull in the generated file's PascalCase
 * non-camelCase original field names.
 */
interface Diagnosis {
  id: number;
  name: string;
  description?: string | null;
  color?: string | null;
  isActive: boolean;
}

interface MedicalRecordFormProps {
  initialValues?: MedicalRecord;
  onSubmit: (
    values: CreateMedicalRecordInput | UpdateMedicalRecordInput,
    files?: File[],
    fileSourceIds?: Map<string, string>,
    deviceDataList?: DeviceDataInput[],
    diagnosisIds?: number[],
  ) => void;
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
  // Line items state
  const [lineItems, setLineItems] = useState<MedicalRecordLineItem[]>(initialValues?.lineItems || []);
  const [discountPercent, setDiscountPercent] = useState<number | undefined>(initialValues?.discountPercent);
  const [manualTotal, setManualTotal] = useState<number | undefined>(initialValues?.manualTotal);
  // Diagnosis tag state.
  //   - `availableDiagnoses`: full picker list, loaded once on mount.
  //   - `selectedDiagnosisIds`: IDs currently applied to this record.
  // For edit mode, the initial selection is fetched separately via the
  // get_diagnoses_for_record command (the record load doesn't currently
  // hydrate diagnoses — kept as a separate join to avoid touching the
  // existing medical record schema).
  const [availableDiagnoses, setAvailableDiagnoses] = useState<Diagnosis[]>([]);
  const [selectedDiagnosisIds, setSelectedDiagnosisIds] = useState<number[]>([]);
  // Validation error field names from the most recent submit attempt.
  // Passed down to TabbedMedicalRecordFields so it can flag the tabs
  // that contain failing fields and auto-switch to the first one.
  const [errorFields, setErrorFields] = useState<string[]>([]);
  const debouncedSearchTerm = useDebounce(titleSearchTerm, 300);
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
        prescriptionNotes: initialValues.prescriptionNotes,
      });
      setRecordType(initialValues.recordType);
      // Set line items state
      setLineItems(initialValues.lineItems || []);
      setDiscountPercent(initialValues.discountPercent);
      setManualTotal(initialValues.manualTotal);
    }
  }, [initialValues?.id, form]);

  // Load the picker's available diagnoses (active only — inactive ones
  // are still rendered on edit if they were already applied, but they
  // can't be newly selected from the dropdown).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const diagnoses = await invoke<Diagnosis[]>('get_diagnoses', {
          activeOnly: true,
        });
        if (!cancelled) setAvailableDiagnoses(diagnoses || []);
      } catch (e) {
        console.error('Failed to load diagnoses for picker:', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // For edit mode, load the diagnoses currently linked to this record.
  // Also merge any inactive ones into `availableDiagnoses` so the
  // multi-select can render them as already-selected without losing
  // the label.
  useEffect(() => {
    if (!isEdit || !recordId) {
      setSelectedDiagnosisIds([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const current = await invoke<Diagnosis[]>('get_diagnoses_for_record', {
          medicalRecordId: recordId,
        });
        if (cancelled) return;
        setSelectedDiagnosisIds((current || []).map((d) => d.id));
        // Merge any inactive (or otherwise missing-from-picker)
        // diagnoses into the available list so they still render with
        // their proper label/color in the Select.
        setAvailableDiagnoses((prev) => {
          const byId = new Map(prev.map((d) => [d.id, d]));
          for (const d of current || []) {
            if (!byId.has(d.id)) byId.set(d.id, d);
          }
          return Array.from(byId.values()).sort((a, b) =>
            a.name.localeCompare(b.name),
          );
        });
      } catch (e) {
        console.error('Failed to load diagnoses for record:', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isEdit, recordId]);

  const handleFinish = (values: any) => {
    // Convert MedicalRecordLineItem to CreateLineItemInput for submission
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

    const formData = isEdit
      ? {
          name: values.name,
          description: values.description,
          prescriptionNotes: values.prescriptionNotes,
          discountPercent: discountPercent,
          manualTotal: manualTotal,
          lineItems: lineItemsInput,
        } as UpdateMedicalRecordInput
      : {
          patientId: patientId,
          recordType: values.recordType,
          name: values.name,
          description: values.description,
          prescriptionNotes: values.prescriptionNotes,
          discountPercent: discountPercent,
          manualTotal: manualTotal,
          lineItems: lineItemsInput,
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

    onSubmit(
      formData,
      !isEdit ? pendingFiles : undefined,
      !isEdit ? fileSourceIds : undefined,
      deviceDataList.length > 0 ? deviceDataList : undefined,
      // Pass the chosen diagnosis IDs as a separate parameter — the
      // parent (MedicalRecordModal) calls set_diagnoses_for_record
      // after the record save succeeds. Diagnoses live in a junction
      // table and don't piggyback on the medical record's own update
      // command, which keeps both backend paths independently small.
      selectedDiagnosisIds,
    );
  };

  const handleRecordTypeChange = (value: RecordType) => {
    setRecordType(value);
    setTitleSearchTerm('');
    if (value === 'note' || value === 'test_result') {
      form.setFieldValue('procedureName', undefined);
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
      onFinish={(values) => {
        // Reset error indicators on success path so a previously
        // failed submit doesn't leave stale red dots on the tabs.
        if (errorFields.length > 0) setErrorFields([]);
        handleFinish(values);
      }}
      onFinishFailed={({ errorFields: errs }) => {
        // AntD only renders the inline error on the field itself — if
        // that field is on a hidden tab the user sees nothing happen
        // when they click Create. Surface a notification AND record
        // which fields failed so TabbedMedicalRecordFields can switch
        // to the right tab and flag it.
        const names = errs.map((e) => e.name.join('.'));
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
      }}
      // Clear error indicators as soon as the user starts fixing
      // the offending field — no need to wait for the next submit.
      onValuesChange={(changed) => {
        if (errorFields.length === 0) return;
        const changedNames = Object.keys(changed);
        const remaining = errorFields.filter((f) => !changedNames.includes(f));
        if (remaining.length !== errorFields.length) setErrorFields(remaining);
      }}
      initialValues={{
        recordType: 'procedure',
      }}
    >
      {/* Medical Record Fields using tabbed component.
          Diagnoses + File Attachments are rendered INSIDE the Standard
          tab via the standardTabExtras prop so they don't visually
          compete with the Prescriptions / Factura tabs — each tab is
          self-contained. */}
      <TabbedMedicalRecordFields
        form={form}
        recordType={recordType}
        onRecordTypeChange={handleRecordTypeChange}
        templates={searchedTemplates}
        isSearchingTemplates={isSearching}
        onTemplateSearch={setTitleSearchTerm}
        onTemplateSelect={handleTemplateSelect}
        hideRecordType={isEdit}
        // Line items props
        lineItems={lineItems}
        onLineItemsChange={setLineItems}
        discountPercent={discountPercent}
        onDiscountChange={setDiscountPercent}
        manualTotal={manualTotal}
        onManualTotalChange={setManualTotal}
        showLineItemsBadge={lineItems.length > 0}
        lineItemsCount={lineItems.length}
        errorFields={errorFields}
        standardTabExtras={
          <>
            <Divider />

            {/* Diagnoses (tag-style multi-select).
                Each diagnosis is a row in the `diagnoses` table managed
                via Settings → Diagnoses. The Select rendering uses each
                diagnosis's color hint so the in-form tags match how
                the record displays elsewhere. */}
            <Form.Item
              label={
                <Space>
                  <TagsOutlined />
                  <span>{t('medical:fields.diagnoses', 'Diagnoses')}</span>
                </Space>
              }
              // Not in `name=` because we manage the selection state
              // outside the AntD Form (we need to pass it to the parent
              // in a separate onSubmit parameter, not in formData).
              extra={t(
                'medical:diagnosesHint',
                'Tag this record with one or more diagnoses. Manage the list in Settings → Diagnoses.',
              )}
            >
              <Select
                mode="multiple"
                value={selectedDiagnosisIds}
                onChange={setSelectedDiagnosisIds}
                placeholder={t(
                  'medical:placeholders.selectDiagnoses',
                  'Select one or more diagnoses…',
                )}
                allowClear
                style={{ width: '100%' }}
                // Search by label (the diagnosis name) — option's
                // `value` is the numeric id, so default substring
                // filterOption matches the id text which isn't what
                // users want.
                filterOption={(input, option) => {
                  const label = (option?.label as string) || '';
                  return label.toLowerCase().includes(input.toLowerCase());
                }}
                tagRender={({ value, label, closable, onClose }) => {
                  const d = availableDiagnoses.find((x) => x.id === value);
                  return (
                    <Tag
                      color={d?.color || 'blue'}
                      closable={closable}
                      onClose={onClose}
                      style={{ marginInlineEnd: 4 }}
                    >
                      {label}
                    </Tag>
                  );
                }}
                options={availableDiagnoses.map((d) => ({
                  value: d.id,
                  label: d.name,
                }))}
              />
            </Form.Item>

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
          </>
        }
      />

      <Form.Item className={styles.submitButton}>
        <Space>
          <Button
            type="primary"
            htmlType="submit"
            loading={loading}
            icon={<SaveOutlined />}
            data-testid="medical-record-form-submit-btn"
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
