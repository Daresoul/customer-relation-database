import React, { useEffect, useState } from 'react';
import {
  App,
  Button,
  Card,
  Col,
  Form,
  Input,
  InputNumber,
  Modal,
  Radio,
  Row,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import { BankOutlined, PictureOutlined, PlusOutlined, EditOutlined, PercentageOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { open as openDialog } from '@tauri-apps/api/dialog';
import {
  useClinicProfile,
  useUpdateClinicProfile,
  useClinicLogo,
  useSetClinicLogo,
  useRemoveClinicLogo,
  useTaxRates,
  useCreateTaxRate,
  useUpdateTaxRate,
} from '@/hooks/useClinic';
import type { ClinicProfile, TaxRate, UpdateClinicProfileInput } from '@/types/clinic';
import { localeNumberParser } from '@/utils/localeNumber';
import styles from '../Settings.module.css';

const { Text } = Typography;

const TEXT_FIELDS = [
  'name',
  'address',
  'city',
  'phone',
  'email',
  'taxNumber',
  'registrationNumber',
  'bankAccount',
  'bankName',
] as const;

type ProfileForm = Record<(typeof TEXT_FIELDS)[number], string> & { pricesIncludeVat: boolean };

function toForm(profile: ClinicProfile): ProfileForm {
  const values = { pricesIncludeVat: profile.pricesIncludeVat } as ProfileForm;
  for (const field of TEXT_FIELDS) {
    values[field] = profile[field] ?? '';
  }
  return values;
}

function toInput(values: Partial<ProfileForm>): UpdateClinicProfileInput {
  const input = { pricesIncludeVat: values.pricesIncludeVat ?? true } as UpdateClinicProfileInput;
  for (const field of TEXT_FIELDS) {
    input[field] = (values[field] ?? '').trim();
  }
  return input;
}

const ClinicSettings: React.FC<{ isUpdating?: boolean }> = () => {
  const { t } = useTranslation(['settings', 'common', 'forms']);
  const { message } = App.useApp();
  const [form] = Form.useForm<ProfileForm>();
  const [rateForm] = Form.useForm<{ name: string; percent: number }>();
  const [editingRate, setEditingRate] = useState<TaxRate | null>(null);
  const [rateModalOpen, setRateModalOpen] = useState(false);

  const { data: profile } = useClinicProfile();
  const { data: logo } = useClinicLogo();
  const { data: rates = [], isLoading: ratesLoading } = useTaxRates(false);
  const updateProfile = useUpdateClinicProfile();
  const setLogo = useSetClinicLogo();
  const removeLogo = useRemoveClinicLogo();
  const createRate = useCreateTaxRate();
  const updateRate = useUpdateTaxRate();

  useEffect(() => {
    if (profile) {
      form.setFieldsValue(toForm(profile));
    }
  }, [profile, form]);

  const saveProfile = async (values: ProfileForm) => {
    try {
      await updateProfile.mutateAsync(toInput(values));
      message.success(t('settings:clinic.saved'));
    } catch {
      // useUpdateClinicProfile already reported the failure
    }
  };

  const chooseLogo = async () => {
    const picked = await openDialog({
      multiple: false,
      directory: false,
      filters: [{ name: t('settings:clinic.logoTitle'), extensions: ['png', 'jpg', 'jpeg'] }],
    });
    if (typeof picked !== 'string') return;
    try {
      await setLogo.mutateAsync(picked);
    } catch {
      // useSetClinicLogo already reported the failure
    }
  };

  const openRateModal = (rate: TaxRate | null) => {
    setEditingRate(rate);
    rateForm.setFieldsValue(rate ? { name: rate.name, percent: rate.percent } : { name: '', percent: undefined });
    setRateModalOpen(true);
  };

  const saveRate = async (values: { name: string; percent: number }) => {
    try {
      if (editingRate) {
        await updateRate.mutateAsync({ id: editingRate.id, input: { name: values.name, percent: values.percent } });
      } else {
        await createRate.mutateAsync({ name: values.name, percent: values.percent });
      }
      setRateModalOpen(false);
    } catch {
      // the hook already reported the failure
    }
  };

  const changeRate = async (rate: TaxRate, input: { isDefault?: boolean; isActive?: boolean }) => {
    try {
      await updateRate.mutateAsync({ id: rate.id, input });
    } catch {
      // useUpdateTaxRate already reported the failure
    }
  };

  const rateColumns = [
    {
      title: t('settings:vat.name'),
      dataIndex: 'name',
      key: 'name',
      render: (name: string, rate: TaxRate) => (
        <Space>
          <span className={rate.isActive ? styles.roomNameActive : styles.roomNameInactive}>{name}</span>
          {rate.isDefault && <Tag color="blue">{t('settings:vat.default')}</Tag>}
          {!rate.isActive && <Tag>{t('settings:vat.hidden')}</Tag>}
        </Space>
      ),
    },
    {
      title: t('settings:vat.percent'),
      dataIndex: 'percent',
      key: 'percent',
      width: 110,
      render: (percent: number) => `${percent}%`,
    },
    {
      title: t('common:actionsLabel'),
      key: 'actions',
      width: 320,
      render: (_: unknown, rate: TaxRate) => (
        <Space wrap>
          <Button size="small" icon={<EditOutlined />} onClick={() => openRateModal(rate)}>
            {t('common:edit')}
          </Button>
          {rate.isActive && !rate.isDefault && (
            <Button size="small" onClick={() => changeRate(rate, { isDefault: true })}>
              {t('settings:vat.makeDefault')}
            </Button>
          )}
          <Button size="small" onClick={() => changeRate(rate, { isActive: !rate.isActive })}>
            {rate.isActive ? t('settings:vat.hide') : t('settings:vat.show')}
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Form scrollToFirstError={{ focus: true }} form={form} layout="vertical" onFinish={saveProfile}>
        <Card
          className={styles.roomsCard}
          title={
            <span className={styles.cardTitle}>
              <BankOutlined /> {t('settings:clinic.title')}
            </span>
          }
        >
          <p>{t('settings:clinic.description')}</p>
          <Form.Item name="name" label={t('settings:clinic.name')} extra={t('settings:clinic.nameHint')}>
            <Input />
          </Form.Item>
          <Row gutter={16}>
            <Col xs={24} md={14}>
              <Form.Item name="address" label={t('settings:clinic.address')}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={10}>
              <Form.Item name="city" label={t('settings:clinic.city')}>
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item name="phone" label={t('settings:clinic.phone')}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                name="email"
                label={t('settings:clinic.email')}
                rules={[{ type: 'email', message: t('forms:validation.email') }]}
              >
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item name="taxNumber" label={t('settings:clinic.taxNumber')}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="registrationNumber" label={t('settings:clinic.registrationNumber')}>
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item name="bankAccount" label={t('settings:clinic.bankAccount')}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="bankName" label={t('settings:clinic.bankName')}>
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            name="pricesIncludeVat"
            label={t('settings:vat.priceMode')}
            extra={t('settings:vat.priceModeHint')}
          >
            <Radio.Group>
              <Radio value={true}>{t('settings:vat.pricesGross')}</Radio>
              <Radio value={false}>{t('settings:vat.pricesNet')}</Radio>
            </Radio.Group>
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={updateProfile.isPending}>
            {t('settings:clinic.save')}
          </Button>
        </Card>
      </Form>

      <Card
        className={styles.roomsCard}
        title={
          <span className={styles.cardTitle}>
            <PictureOutlined /> {t('settings:clinic.logoTitle')}
          </span>
        }
      >
        <Space direction="vertical">
          {logo ? (
            <img src={logo} alt={t('settings:clinic.logoAlt')} style={{ maxWidth: 160, maxHeight: 160 }} />
          ) : (
            <Text type="secondary">{t('settings:clinic.noLogo')}</Text>
          )}
          <Text type="secondary">{t('settings:clinic.logoHint')}</Text>
          <Space>
            <Button onClick={chooseLogo} loading={setLogo.isPending}>
              {t('settings:clinic.chooseLogo')}
            </Button>
            {profile?.logoPath && (
              <Button danger onClick={() => removeLogo.mutateAsync().catch(() => undefined)} loading={removeLogo.isPending}>
                {t('settings:clinic.removeLogo')}
              </Button>
            )}
          </Space>
        </Space>
      </Card>

      <Card
        className={styles.roomsCard}
        title={
          <span className={styles.cardTitle}>
            <PercentageOutlined /> {t('settings:vat.title')}
          </span>
        }
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openRateModal(null)}>
            {t('settings:vat.add')}
          </Button>
        }
      >
        <p>{t('settings:vat.description')}</p>
        <Table
          columns={rateColumns}
          dataSource={rates}
          rowKey="id"
          pagination={false}
          size="middle"
          loading={ratesLoading}
        />
      </Card>

      <Modal
        title={editingRate ? t('settings:vat.editTitle') : t('settings:vat.createTitle')}
        open={rateModalOpen}
        onCancel={() => setRateModalOpen(false)}
        onOk={() => rateForm.submit()}
        confirmLoading={createRate.isPending || updateRate.isPending}
      >
        <Form scrollToFirstError={{ focus: true }} form={rateForm} layout="vertical" onFinish={saveRate}>
          <Form.Item
            name="name"
            label={t('settings:vat.name')}
            rules={[{ required: true, whitespace: true, message: t('forms:validation.required') }]}
          >
            <Input placeholder="ДДВ 18%" />
          </Form.Item>
          <Form.Item
            name="percent"
            label={t('settings:vat.percent')}
            extra={editingRate ? t('settings:vat.percentChangeHint') : undefined}
            rules={[{ required: true, message: t('forms:validation.required') }]}
          >
            <InputNumber min={0} max={100} step={1} parser={localeNumberParser} className={styles.fullWidth} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ClinicSettings;
