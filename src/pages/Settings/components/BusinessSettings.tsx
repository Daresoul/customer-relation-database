import React from 'react';
import { Card, Form, Select, Typography } from 'antd';
import { DollarOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../../../utils/themeStyles';
import styles from '../Settings.module.css';
import { useCurrencies } from '../../../hooks/useCurrencies';

const { Text } = Typography;
const { Option } = Select;

interface BusinessSettingsProps {
  isUpdating: boolean;
}

const BusinessSettings: React.FC<BusinessSettingsProps> = ({ isUpdating }) => {
  const { t } = useTranslation(['common', 'forms']);
  const themeColors = useThemeColors();
  const { data: currencies, isLoading: currenciesLoading } = useCurrencies();

  return (
    <div>
      <Card
        title={
          <span className={styles.cardTitle}>
            <DollarOutlined /> {t('common:currency')}
          </span>
        }
        className={styles.businessCard}
      >
        <Form.Item
          name="currencyId"
          label={<span className={styles.formLabel}>{t('common:currency')}</span>}
          extra={<span className={styles.formHint}>Default currency for new procedures</span>}
        >
          <Select
            size="large"
            allowClear
            placeholder={t('common:selectPlaceholder')}
            loading={currenciesLoading}
            showSearch
            optionFilterProp="children"
            filterOption={(input, option) =>
              (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
            }
            className={styles.fullWidth}
            disabled={isUpdating}
          >
            {currencies?.map((currency) => (
              <Option
                key={currency.id}
                value={currency.id}
                label={`${currency.code} - ${currency.name}`}
              >
                {currency.symbol && <span>{currency.symbol} </span>}
                {currency.code} - {currency.name}
              </Option>
            ))}
          </Select>
        </Form.Item>
      </Card>
    </div>
  );
};

export default BusinessSettings;