import React from 'react';
import { Input } from 'antd';
import { SearchOutlined } from '@ant-design/icons';

interface PatientSearchProps {
    value?: string;
    onChange?: (value: string) => void;
    placeholder?: string;
}

const PatientSearch: React.FC<PatientSearchProps> = ({
    value,
    onChange,
    placeholder
}) => {
    return (
        <Input
            prefix={<SearchOutlined />}
            placeholder={placeholder || "Search patients..."}
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
            allowClear
            style={{ width: 300 }}
        />
    );
};

export default PatientSearch;
