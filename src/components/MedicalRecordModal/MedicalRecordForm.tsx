import React, { useState, useEffect } from 'react';
import { Form, Input, Select, Button, Space, Divider, InputNumber, List, Typography, Upload, message } from 'antd';
import { SaveOutlined, CloseOutlined, UploadOutlined, DeleteOutlined, InboxOutlined } from '@ant-design/icons';
import FileUpload from '../FileUpload/FileUpload';
import FileAttachmentList from '../FileUpload/FileAttachmentList';
import { useCurrencies, useMedicalRecord } from '@/hooks/useMedicalRecords';
import { MedicalService } from '@/services/medicalService';
import type { MedicalRecord, CreateMedicalRecordInput, UpdateMedicalRecordInput } from '@/types/medical';
import type { UploadFile } from 'antd';

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
  const [form] = Form.useForm();
  const [recordType, setRecordType] = useState<string>(initialValues?.recordType || 'note');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const { data: currencies } = useCurrencies();

  useEffect(() => {
    console.log('Available currencies:', currencies);
  }, [currencies]);
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
  }, [initialValues, form]);

  const handleFinish = (values: any) => {
    console.log('Form values before submit:', values);
    console.log('Selected currencyId:', values.currencyId);

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
    }
  };

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={handleFinish}
      initialValues={{ recordType: 'note' }}
    >
      {!isEdit && (
        <Form.Item
          name="recordType"
          label="Record Type"
          rules={[{ required: true, message: 'Please select a record type' }]}
        >
          <Select onChange={handleRecordTypeChange}>
            <Option value="note">Note</Option>
            <Option value="procedure">Procedure</Option>
          </Select>
        </Form.Item>
      )}

      <Form.Item
        name="name"
        label={recordType === 'procedure' ? 'Procedure Name' : 'Title'}
        rules={[
          { required: true, message: recordType === 'procedure' ? 'Please enter the procedure name' : 'Please enter a title' },
          { max: 200, message: recordType === 'procedure' ? 'Procedure name must be less than 200 characters' : 'Title must be less than 200 characters' },
        ]}
      >
        <Input placeholder={recordType === 'procedure' ? "e.g., Spay/Neuter, Dental Cleaning, Blood Test" : "e.g., Annual Checkup, Follow-up Note, Observation"} />
      </Form.Item>

      <Form.Item
        name="description"
        label="Description/Notes"
        rules={[{ required: true, message: 'Please enter a description' }]}
      >
        <TextArea
          rows={6}
          placeholder="Enter detailed notes about the procedure or observation..."
          showCount
          maxLength={5000}
        />
      </Form.Item>

      {recordType === 'procedure' && (
        <Space size="middle" style={{ width: '100%' }}>
          <Form.Item
            name="price"
            label="Price (Optional)"
            style={{ marginBottom: 0, flex: 1 }}
          >
            <InputNumber
              min={0}
              precision={2}
              placeholder="0.00"
              style={{ width: '100%' }}
            />
          </Form.Item>

          <Form.Item
            name="currencyId"
            label="Currency"
            style={{ marginBottom: 0, minWidth: 120 }}
          >
            <Select placeholder="Select" allowClear>
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
        <div style={{ marginBottom: 24 }}>
          <h4>File Attachments</h4>
          {recordDetail?.attachments && recordDetail.attachments.length > 0 ? (
            <FileAttachmentList
              attachments={recordDetail.attachments}
              onDelete={() => refetchRecord()}
            />
          ) : (
            <Text type="secondary">No attachments</Text>
          )}
          <div style={{ marginTop: 16 }}>
            <FileUpload
              medicalRecordId={recordId}
              onUploadSuccess={() => refetchRecord()}
            />
          </div>
        </div>
      )}

      {!isEdit && (
        <div style={{ marginBottom: 24 }}>
          <h4>File Attachments</h4>
          <Dragger
            beforeUpload={(file) => {
              const error = MedicalService.validateFile(file);
              if (error) {
                message.error(error);
                return false;
              }
              setPendingFiles([...pendingFiles, file]);
              return false;
            }}
            onRemove={(file) => {
              const index = pendingFiles.indexOf(file as any);
              if (index > -1) {
                const newFiles = [...pendingFiles];
                newFiles.splice(index, 1);
                setPendingFiles(newFiles);
              }
            }}
            fileList={pendingFiles.map((file, index) => ({
              uid: String(index),
              name: file.name,
              size: file.size,
              type: file.type,
              status: 'done',
            } as UploadFile))}
            multiple
            accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.jpg,.jpeg,.png,.gif,.bmp"
            style={{ marginBottom: pendingFiles.length > 0 ? 8 : 0 }}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined style={{ fontSize: 48, color: '#4A90E2' }} />
            </p>
            <p className="ant-upload-text">Click or drag files to this area to upload</p>
            <p className="ant-upload-hint">
              Support for PDF, Word, Excel, images and text files. Max 100MB per file.
            </p>
          </Dragger>
          {pendingFiles.length > 0 && (
            <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
              {pendingFiles.length} file(s) will be uploaded when you create the record
            </Text>
          )}
        </div>
      )}

      <Form.Item style={{ marginBottom: 0, marginTop: 24 }}>
        <Space>
          <Button
            type="primary"
            htmlType="submit"
            loading={loading}
            icon={<SaveOutlined />}
          >
            {isEdit ? 'Update' : 'Create'}
          </Button>
          <Button onClick={onCancel} icon={<CloseOutlined />}>
            Cancel
          </Button>
        </Space>
      </Form.Item>
    </Form>
  );
};

export default MedicalRecordForm;