/**
 * MedicalRecordForm - Form for creating and editing medical records
 *
 * Refactored to use MedicalRecordFieldGroup for reusable field definitions.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Form, Button, Space, Divider, Typography, Upload, Drawer, App, Select, Tag, Alert, InputNumber } from 'antd';
import { SaveOutlined, CloseOutlined, InboxOutlined, HistoryOutlined, TagsOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { invoke } from '@/services/invoke';
import RecentDeviceFiles from '../RecentDeviceFiles';
import { MedicalService } from '@/services/medicalService';
import { TabbedMedicalRecordFields } from '@/components/forms/fieldGroups';
import RecordStartBar, { type RecordPrefill } from './RecordStartBar';
import type { MedicalRecord, CreateMedicalRecordInput, UpdateMedicalRecordInput, DeviceDataInput } from '@/types/medical';
import type { MedicalRecordLineItem, CreateLineItemInput } from '@/types/lineItem';
import type { RecordType } from '@/components/forms/fieldGroups';
import type { UploadFile } from 'antd';
import styles from './MedicalRecordForm.module.css';
import { localeNumberParser } from '@/utils/localeNumber';

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
    /** Create only: a weight taken during the visit, for the patient's weight log. */
    visitWeight?: number,
  ) => void;
  onCancel: () => void;
  loading: boolean;
  isEdit: boolean;
  patientId: number;
  recordId: number | null;
  /** Called with true once the user changes anything. */
  onDirtyChange?: (dirty: boolean) => void;
  /** New records only: a starting title, e.g. the appointment's reason. */
  defaultTitle?: string;
}

const MedicalRecordForm: React.FC<MedicalRecordFormProps> = ({
  initialValues,
  defaultTitle,
  onSubmit,
  onCancel,
  loading,
  isEdit,
  patientId,
  recordId,
  onDirtyChange,
}) => {
  const { t } = useTranslation(['medical', 'common', 'forms']);
  const { notification, modal } = App.useApp();
  const [form] = Form.useForm();
  const [recordType, setRecordType] = useState<RecordType>(initialValues?.recordType || 'procedure');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [fileSourceIds, setFileSourceIds] = useState<Map<string, string>>(new Map());
  const [fileDeviceData, setFileDeviceData] = useState<Map<string, DeviceDataInput>>(new Map());
  const [recentFilesDrawerOpen, setRecentFilesDrawerOpen] = useState(false);
  // Line items state
  const [lineItems, setLineItems] = useState<MedicalRecordLineItem[]>(initialValues?.lineItems || []);
  const [discountPercent, setDiscountPercent] = useState<number | null>(initialValues?.discountPercent ?? null);
  const [manualTotal, setManualTotal] = useState<number | null>(initialValues?.manualTotal ?? null);
  // Diagnosis tag state.
  //   - `availableDiagnoses`: full picker list, loaded once on mount.
  //   - `selectedDiagnosisIds`: IDs currently applied to this record.
  // For edit mode, the initial selection is fetched separately via the
  // get_diagnoses_for_record command (the record load doesn't currently
  // hydrate diagnoses — kept as a separate join to avoid touching the
  // existing medical record schema).
  const [availableDiagnoses, setAvailableDiagnoses] = useState<Diagnosis[]>([]);
  const [selectedDiagnosisIds, setSelectedDiagnosisIds] = useState<number[]>([]);
  // An edit saves the full diagnosis set, so it must not save until the
  // record's current diagnoses have loaded: an empty list would wipe them.
  const [diagnosesLoad, setDiagnosesLoad] = useState<'loading' | 'loaded' | 'failed'>(isEdit ? 'loading' : 'loaded');
  const dirtyRef = useRef(false);
  const markDirty = useCallback(() => {
    if (dirtyRef.current) return;
    dirtyRef.current = true;
    onDirtyChange?.(true);
  }, [onDirtyChange]);
  // Validation error field names from the most recent submit attempt.
  // Passed down to TabbedMedicalRecordFields so it can flag the tabs
  // that contain failing fields and auto-switch to the first one.
  const [errorFields, setErrorFields] = useState<string[]>([]);

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
      setDiscountPercent(initialValues.discountPercent ?? null);
      setManualTotal(initialValues.manualTotal ?? null);
    }
  }, [initialValues?.id, form]);

  useEffect(() => {
    if (!initialValues && defaultTitle && !form.getFieldValue('name')) {
      form.setFieldsValue({ name: defaultTitle });
    }
  }, [defaultTitle, initialValues, form]);

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
  const [diagnosesAttempt, setDiagnosesAttempt] = useState(0);
  useEffect(() => {
    if (!isEdit || !recordId) {
      setSelectedDiagnosisIds([]);
      setDiagnosesLoad('loaded');
      return;
    }
    let cancelled = false;
    setDiagnosesLoad('loading');
    (async () => {
      try {
        const current = await invoke<Diagnosis[]>('get_diagnoses_for_record', {
          medicalRecordId: recordId,
        });
        if (cancelled) return;
        setSelectedDiagnosisIds((current || []).map((d) => d.id));
        setAvailableDiagnoses((prev) => {
          const byId = new Map(prev.map((d) => [d.id, d]));
          for (const d of current || []) {
            if (!byId.has(d.id)) byId.set(d.id, d);
          }
          return Array.from(byId.values()).sort((a, b) =>
            a.name.localeCompare(b.name),
          );
        });
        setDiagnosesLoad('loaded');
      } catch (e) {
        console.error('Failed to load diagnoses for record:', e);
        if (!cancelled) setDiagnosesLoad('failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isEdit, recordId, diagnosesAttempt]);

  const saveBlocked = isEdit && diagnosesLoad !== 'loaded';

  const changeLineItems = (items: MedicalRecordLineItem[]) => {
    markDirty();
    setLineItems(items);
  };
  const changeDiscount = (value: number | null) => {
    markDirty();
    setDiscountPercent(value);
  };
  const changeManualTotal = (value: number | null) => {
    markDirty();
    setManualTotal(value);
  };

  const handleFinish = (values: any) => {
    // Convert MedicalRecordLineItem to CreateLineItemInput for submission
    // Cleared values go out as [] / null: a missing field means "unchanged"
    // to the backend, so leaving them out would keep the old ones.
    const lineItemsInput: CreateLineItemInput[] = lineItems.map(item => ({
      templateId: item.templateId,
      name: item.name,
      description: item.description,
      unitPrice: item.unitPrice,
      currencyId: item.currencyId,
      quantity: item.quantity,
      // null: no rate. A missing field would give the line its item's default rate.
      taxRateId: item.taxRateId ?? null,
    }));
    // The manual total stands in for line items; with items it no longer applies.
    const manualTotalInput = lineItems.length > 0 ? null : manualTotal;
    // The Prescriptions tab mounts only once opened, so `values` lacks a
    // prescription a template filled in; the form store has it.
    const prescriptionNotes = form.getFieldValue('prescriptionNotes');

    const formData = isEdit
      ? {
          name: values.name,
          description: values.description,
          prescriptionNotes,
          discountPercent: discountPercent,
          manualTotal: manualTotalInput,
          lineItems: lineItemsInput,
        } as UpdateMedicalRecordInput
      : {
          patientId: patientId,
          recordType: values.recordType,
          name: values.name,
          description: values.description,
          prescriptionNotes,
          discountPercent: discountPercent,
          manualTotal: manualTotalInput,
          lineItems: lineItemsInput.length > 0 ? lineItemsInput : undefined,
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
      saveBlocked ? undefined : selectedDiagnosisIds,
      !isEdit && typeof values.visitWeight === 'number' && values.visitWeight > 0 ? values.visitWeight : undefined,
    );
  };

  const handleRecordTypeChange = (value: RecordType) => {
    setRecordType(value);
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

      markDirty();
      setPendingFiles(prev => [...prev, file]);
      setFileSourceIds(prev => new Map(prev).set(originalName, fileId));

      if (fileData.deviceType && fileData.deviceName) {
        // Only register device data when the backend recovered actual test
        // results — a null/empty payload would reach the PDF as a header-only
        // results table (or, since the backend now refuses empty samples, kill
        // the device report outright). The raw file still attaches either way.
        if (fileData.testResults && Object.keys(fileData.testResults).length > 0) {
          const deviceData: DeviceDataInput = {
            deviceTestData: fileData.testResults,
            deviceType: fileData.deviceType,
            deviceName: fileData.deviceName,
          };
          setFileDeviceData(prev => new Map(prev).set(originalName, deviceData));
        } else {
          notification.warning({
            message: t('common:warning'),
            description: t('medical:recentFiles.couldNotReadResults', { name: originalName }),
            placement: 'bottomRight',
            duration: 8,
          });
        }
      }

      notification.success({
        message: t('common:success'),
        description: t('medical:recentFiles.addedToPending', { name: originalName }),
        placement: 'bottomRight',
        duration: 3,
      });

      setRecentFilesDrawerOpen(false);
    } catch (error) {
      console.error('[MedicalRecordForm] Failed to add recent file:', error);
      notification.error({
        message: t('common:error'),
        description: t('medical:recentFiles.addFromHistoryFailed'),
        placement: 'bottomRight',
        duration: 5,
      });
    }
  };

  /** Fill from a template or the last record: text fields are replaced,
   *  lines are added, diagnoses are merged (active ones only). */
  const applyPrefill = (p: RecordPrefill) => {
    const values: Record<string, unknown> = {};
    if (p.name?.trim()) values.name = p.name;
    if (p.description?.trim()) values.description = p.description;
    if (p.prescriptionNotes?.trim()) values.prescriptionNotes = p.prescriptionNotes;
    if (!isEdit && p.recordType) {
      values.recordType = p.recordType;
      handleRecordTypeChange(p.recordType);
    }
    form.setFieldsValue(values);
    if (p.lineItems?.length) setLineItems((prev) => [...prev, ...p.lineItems!]);
    if (p.diagnosisIds?.length) {
      const known = new Set(availableDiagnoses.map((d) => d.id));
      setSelectedDiagnosisIds((prev) => Array.from(new Set([...prev, ...p.diagnosisIds!.filter((id) => known.has(id))])));
    }
    markDirty();
  };

  const PREFILL_TEXT_FIELDS = ['name', 'description', 'prescriptionNotes'] as const;
  const offerPrefill = (p: RecordPrefill) => {
    const replacesTyped = PREFILL_TEXT_FIELDS.some((field) => {
      const typed = String(form.getFieldValue(field) ?? '').trim();
      const incoming = String(p[field] ?? '').trim();
      return typed !== '' && incoming !== '' && typed !== incoming;
    });
    if (!replacesTyped) {
      applyPrefill(p);
      return;
    }
    modal.confirm({
      title: t('medical:templatePicker.replaceTitle'),
      content: t('medical:templatePicker.replaceBody'),
      okText: t('medical:templatePicker.replace'),
      cancelText: t('medical:templatePicker.keepMine'),
      onOk: () => applyPrefill(p),
    });
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
        markDirty();
        if (errorFields.length === 0) return;
        const changedNames = Object.keys(changed);
        const remaining = errorFields.filter((f) => !changedNames.includes(f));
        if (remaining.length !== errorFields.length) setErrorFields(remaining);
      }}
      initialValues={{
        recordType: 'procedure',
      }}
    >
      <RecordStartBar isEdit={isEdit} patientId={patientId} onPrefill={offerPrefill} />

      {/* Medical Record Fields using tabbed component.
          Diagnoses + File Attachments are rendered INSIDE the Standard
          tab via the standardTabExtras prop so they don't visually
          compete with the Prescriptions / Factura tabs — each tab is
          self-contained. */}
      <TabbedMedicalRecordFields
        form={form}
        recordType={recordType}
        onRecordTypeChange={handleRecordTypeChange}
        hideRecordType={isEdit}
        // Line items props
        lineItems={lineItems}
        onLineItemsChange={changeLineItems}
        discountPercent={discountPercent}
        onDiscountChange={changeDiscount}
        manualTotal={manualTotal}
        onManualTotalChange={changeManualTotal}
        showLineItemsBadge={lineItems.length > 0}
        lineItemsCount={lineItems.length}
        errorFields={errorFields}
        standardTabExtras={
          <>
            {!isEdit && (
              <Form.Item
                name="visitWeight"
                label={t('patients:chart.weights.recordField')}
                extra={t('patients:chart.weights.recordFieldHint')}
              >
                <InputNumber
                  min={0.01}
                  max={500}
                  precision={2}
                  parser={localeNumberParser}
                  addonAfter={t('patients:units.kg')}
                  style={{ width: 200 }}
                />
              </Form.Item>
            )}
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
                onChange={(ids: number[]) => {
                  markDirty();
                  setSelectedDiagnosisIds(ids);
                }}
                disabled={saveBlocked}
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

            {/* File Attachments Section.
                Only shown in create mode — attachments on an existing
                record are managed from the medical record detail page
                (where the Attachments card has its own upload, preview,
                regenerate, etc.). Mixing attachment edits into this
                modal duplicated UI and confused users about where the
                source of truth was. */}
            {!isEdit && <Divider />}

            {!isEdit && (
              <div className={styles.filesSection}>
                <h4>{t('medical:fileAttachments')}</h4>
                <Button
                  type="link"
                  icon={<HistoryOutlined />}
                  onClick={() => setRecentFilesDrawerOpen(true)}
                  style={{ marginBottom: 8, paddingLeft: 0 }}
                >
                  {t('medical:actions.browseRecentDeviceFiles')}
                </Button>
                <Dragger
                  beforeUpload={(file) => {
                    const error = MedicalService.validateFile(file);
                    if (error) {
                      notification.error({ message: t('common:error'), description: error, placement: "bottomRight", duration: 5 });
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
                    markDirty();
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

      {isEdit && diagnosesLoad === 'failed' && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message={t('medical:messages.diagnosesLoadFailed')}
          description={t('medical:messages.diagnosesLoadFailedHint')}
          action={
            <Button size="small" onClick={() => setDiagnosesAttempt((n) => n + 1)}>
              {t('medical:actions.retry')}
            </Button>
          }
        />
      )}

      <Form.Item className={styles.submitButton}>
        <Space>
          <Button
            type="primary"
            htmlType="submit"
            loading={loading}
            disabled={saveBlocked}
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
        title={t('medical:deviceImport.recentFilesTitle')}
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
