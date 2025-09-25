import React from 'react';
import { Select, Spin } from 'antd';
import { useTranslation } from 'react-i18next';
import { useCurrencies } from '../../hooks/useCurrencies';
import { useAppSettings } from '../../hooks/useAppSettings';

const { Option } = Select;

interface CurrencySelectorProps {
  value?: number;
  onChange?: (value: number) => void;
  style?: React.CSSProperties;
  allowClear?: boolean;
  placeholder?: string;
}

export const CurrencySelector: React.FC<CurrencySelectorProps> = ({
  value,
  onChange,
  style,
  allowClear = false,
  placeholder,
}) => {
  const { t } = useTranslation('common');
  const { data: currencies, isLoading } = useCurrencies();
  const { settings } = useAppSettings();

  // Use provided value, or fall back to settings default
  const currentValue = value !== undefined ? value : settings?.currencyId;

  if (isLoading) {
    return <Spin size="small" />;
  }

  return (
    <Select
      value={currentValue}
      onChange={onChange}
      style={{ width: 200, ...style }}
      allowClear={allowClear}
      placeholder={placeholder || t('selectPlaceholder')}
      showSearch
      optionFilterProp="children"
      filterOption={(input, option) =>
        (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
      }
    >
      {currencies?.map((currency) => (
        <Option key={currency.id} value={currency.id} label={`${currency.code} - ${currency.name}`}>
          {currency.symbol && <span>{currency.symbol} </span>}
          {currency.code} - {currency.name}
        </Option>
      ))}
    </Select>
  );
};