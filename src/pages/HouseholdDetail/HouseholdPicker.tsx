import React, { useEffect, useRef, useState } from 'react';
import { Select, Space, Spin, Typography } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { HouseholdService } from '../../services/householdService';
import type { HouseholdSearchResult } from '../../types/household';

const { Text } = Typography;

export interface HouseholdPickerProps {
  /** Never offered, e.g. the household the user is on. */
  excludeId?: number;
  onChange: (household: HouseholdSearchResult | undefined) => void;
  autoFocus?: boolean;
}

function primaryOf(h: HouseholdSearchResult) {
  return h.people?.find((p) => p.isPrimary) ?? h.people?.[0];
}

/** Search-as-you-type household picker showing who and how to reach them. */
export const HouseholdPicker: React.FC<HouseholdPickerProps> = ({ excludeId, onChange, autoFocus }) => {
  const { t } = useTranslation('households');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<HouseholdSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<number | undefined>();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const onSearch = (value: string) => {
    setQuery(value);
    if (timer.current) clearTimeout(timer.current);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }
    timer.current = setTimeout(async () => {
      setSearching(true);
      setFailed(false);
      try {
        const response = await HouseholdService.searchHouseholds(value.trim(), 10);
        setResults((response?.results ?? []).filter((h) => h.id !== excludeId));
      } catch {
        setResults([]);
        setFailed(true);
      } finally {
        setSearching(false);
      }
    }, 250);
  };

  return (
    <Select
      showSearch
      autoFocus={autoFocus}
      value={selected}
      placeholder={t('picker.placeholder')}
      suffixIcon={<SearchOutlined />}
      filterOption={false}
      onSearch={onSearch}
      onChange={(id: number) => {
        setSelected(id);
        onChange(results.find((h) => h.id === id));
      }}
      notFoundContent={
        searching ? (
          <Spin size="small" />
        ) : query.trim().length < 2 ? (
          t('picker.typeMore')
        ) : failed ? (
          t('picker.searchFailed')
        ) : (
          t('picker.noMatches')
        )
      }
      style={{ width: '100%' }}
    >
      {results.map((h) => {
        const person = primaryOf(h);
        const phone = person?.contacts?.find((c) => c.contactType !== 'email')?.contactValue;
        return (
          <Select.Option key={h.id} value={h.id}>
            <Space size={6} wrap>
              <Text strong>{h.householdName || t('unnamedHousehold')}</Text>
              {person && <Text>{`${person.firstName} ${person.lastName}`}</Text>}
              {phone && <Text type="secondary">{phone}</Text>}
              {h.address && <Text type="secondary">{h.address}</Text>}
              <Text type="secondary">{t('duplicates.pets', { count: h.petCount ?? 0 })}</Text>
            </Space>
          </Select.Option>
        );
      })}
    </Select>
  );
};
