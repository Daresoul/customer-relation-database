import React from 'react';
import { Input } from 'antd';
import { SearchOutlined } from '@ant-design/icons';

interface HouseholdSearchProps {
    value?: string;
    onChange?: (value: string) => void;
    placeholder?: string;
}

const HouseholdSearch: React.FC<HouseholdSearchProps> = ({
    value,
    onChange,
    placeholder
}) => {
    return (
        <Input
            prefix={<SearchOutlined />}
            placeholder={placeholder || "Search households..."}
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
            allowClear
            style={{ width: 300 }}
        />
    );
};

export default HouseholdSearch;
