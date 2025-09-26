/**
 * Example main dashboard using all Ant Design components
 */

import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Statistic, Space, Tabs, Avatar, TabsProps, App, Modal, InputNumber } from 'antd';
import {
  TeamOutlined,
  HeartOutlined,
  CalendarOutlined,
  RiseOutlined,
  UserOutlined,
  HomeOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
// Removed AppLayout - using simpler layout
import { PatientTable } from '../components/tables/PatientTable';
import { HouseholdTable } from '../components/tables/HouseholdTable';
import { PatientSearch } from '../components/search/PatientSearch';
import { HouseholdSearch } from '../components/search/HouseholdSearch';
import { Button } from '../components/common/Button';
import { invoke } from '@tauri-apps/api/tauri';
import { FormModal } from '../components/common/Modal';
import { PatientFormWithOwner } from '../components/forms/PatientFormWithOwner';
import { HouseholdForm } from '../components/forms/HouseholdForm';
import { Loading, PageLoader } from '../components/common/Loading';
import { NoData } from '../components/common/EmptyState';
import AppointmentsTab from './Appointments/AppointmentsTab';
import { useViewContext } from '../contexts/ViewContext';
import api, { setAppInstance } from '../services/api.integration';
import notifications from '../services/notifications';
import type { Patient, PatientWithHousehold } from '../types';
import type { HouseholdTableRecord } from '../types/ui.types';
import { useThemeColors } from '../utils/themeStyles';

// Removed TabPane - using items prop instead

export const MainDashboard: React.FC = () => {
  const { t } = useTranslation(['patients', 'common', 'navigation']);
  const navigate = useNavigate();
  const { currentView, setCurrentView } = useViewContext();
  const app = App.useApp();
  const themeColors = useThemeColors();
  const activeView = currentView === 'animal' ? 'patients' : currentView === 'household' ? 'households' : 'appointments';
  const [loading, setLoading] = useState(true);
  const [patients, setPatients] = useState<PatientWithHousehold[]>([]);
  const [households, setHouseholds] = useState<HouseholdTableRecord[]>([]);
  const [filteredPatients, setFilteredPatients] = useState<PatientWithHousehold[]>([]);
  const [filteredHouseholds, setFilteredHouseholds] = useState<HouseholdTableRecord[]>([]);
  const [showPatientForm, setShowPatientForm] = useState(false);
  const [showHouseholdForm, setShowHouseholdForm] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<PatientWithHousehold | null>(null);
  const [selectedHousehold, setSelectedHousehold] = useState<HouseholdTableRecord | null>(null);
  const [seedOpen, setSeedOpen] = useState(false);
  const [seedCount, setSeedCount] = useState<number>(1000);
  const [seeding, setSeeding] = useState(false);

  // Statistics
  const [stats, setStats] = useState({
    totalPatients: 0,
    activePatients: 0,
    totalHouseholds: 0,
  });

  // Load initial data from database and set app instance
  useEffect(() => {
    setAppInstance(app);
    loadData();
  }, [app]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Get stats efficiently from database counts
      const statsPromise = invoke<{
        total_patients: number;
        active_patients: number;
        total_households: number;
        total_medical_records: number;
      }>('get_dashboard_stats');

      // Get a reasonable amount of data for display (pagination would be better for large datasets)
      const [patientsResults, householdsResults, statsData] = await Promise.all([
        api.patient.search('', 1000), // Get first 1000 for display
        api.household.search('', 1000), // Get first 1000 for display
        statsPromise
      ]);

      // Enhance patients with household names
      const enhancedPatients = patientsResults.map(patient => {
        const household = householdsResults.find(h => h.id === patient.householdId);
        return {
          ...patient,
          household: household ? {
            id: household.id,
            householdName: household.lastName || 'Unnamed',
            address: household.address
          } : undefined
        } as PatientWithHousehold;
      });

      setPatients(enhancedPatients);
      setHouseholds(householdsResults);
      setFilteredPatients(enhancedPatients);
      setFilteredHouseholds(householdsResults);

      // Use actual database counts for statistics
      setStats({
        totalPatients: statsData.total_patients,
        activePatients: statsData.active_patients,
        totalHouseholds: statsData.total_households,
      });
    } catch (error) {
      console.error('Failed to load data:', error);
      // Use empty data on error
      setPatients([]);
      setHouseholds([]);
      setFilteredPatients([]);
      setFilteredHouseholds([]);
      setStats({
        totalPatients: 0,
        activePatients: 0,
        totalHouseholds: 0,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSeed = async () => {
    setSeeding(true);
    console.log('[FRONTEND] Starting seed with input:', seedCount);

    try {
      const households = Math.max(1, Number(seedCount) || 1000);
      console.log('[FRONTEND] Parsed households:', households);
      console.log('[FRONTEND] Calling populate_database with:', { households });

      const res = await invoke<string>('populate_database', { households });
      console.log('[FRONTEND] Seed response:', res);

      app.message.success(res || `Seeded ${households} households`);
      setSeedOpen(false);
      await loadData();
    } catch (e: any) {
      console.error('[FRONTEND] Seed error:', e);
      app.message.error(e?.message || 'Failed to seed database');
    } finally {
      setSeeding(false);
    }
  };

  // Handle search - filter the already loaded data
  const handlePatientSearch = async (query: string) => {
    if (!query || query.trim().length === 0) {
      setFilteredPatients(patients);
      return patients;
    }

    const results = await api.patient.search(query);
    // Enhance search results with household names
    const enhancedResults = results.map(patient => {
      const household = households.find(h => h.id === patient.householdId);
      return {
        ...patient,
        household: household ? {
          id: household.id,
          householdName: household.lastName || 'Unnamed',
          address: household.address
        } : undefined
      } as PatientWithHousehold;
    });
    setFilteredPatients(enhancedResults);
    return enhancedResults;
  };

  const handleHouseholdSearch = async (query: string) => {
    if (!query || query.trim().length === 0) {
      setFilteredHouseholds(households);
      return households;
    }

    const results = await api.household.search(query);
    setFilteredHouseholds(results);
    return results;
  };

  // Handle patient operations
  const handleViewPatient = (patient: PatientWithHousehold) => {
    setSelectedPatient(patient);
    // Open detail view modal
  };

  const handleEditPatient = (patient: PatientWithHousehold) => {
    setSelectedPatient(patient);
    setShowPatientForm(true);
  };

  const handleDeletePatient = async (patient: PatientWithHousehold) => {
    if (!window.confirm(t('patients:confirmDelete', { name: patient.name }))) {
      return;
    }
    await api.patient.delete(patient.id);
    loadData();
  };

  const handleSavePatient = async (values: any) => {
    if (selectedPatient) {
      await api.patient.update(selectedPatient.id, values);
    } else {
      await api.patient.create(values);
    }
    setShowPatientForm(false);
    setSelectedPatient(null);
    loadData();
  };

  // Handle household operations
  const handleViewHousehold = (household: HouseholdTableRecord) => {
    setSelectedHousehold(household);
    // Open detail view modal
  };

  const handleEditHousehold = (household: HouseholdTableRecord) => {
    setSelectedHousehold(household);
    setShowHouseholdForm(true);
  };

  const handleDeleteHousehold = async (household: HouseholdTableRecord) => {
    if (!window.confirm(t('patients:confirmDeleteHousehold', { name: household.lastName }))) {
      return;
    }
    await api.household.delete(household.id);
    loadData();
  };

  const handleSaveHousehold = async (values: any) => {
    if (selectedHousehold) {
      await api.household.update(selectedHousehold.id, values);
    } else {
      await api.household.create(values);
    }
    setShowHouseholdForm(false);
    setSelectedHousehold(null);
    loadData();
  };

  if (loading) {
    return <PageLoader message={t('common:loading')} />;
  }

  // Simplified layout without header

  return (
    <div style={{ background: themeColors.background, padding: '24px' }}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* Statistics Cards */}
        <Row gutter={16}>
          <Col span={8}>
            <Card>
              <Statistic
                title={t('patients:statistics.totalPatients')}
                value={stats.totalPatients}
                prefix={<HeartOutlined />}
                valueStyle={{ color: '#ff69b4' }}
              />
            </Card>
          </Col>
          <Col span={8}>
            <Card>
              <Statistic
                title={t('patients:statistics.activePatients')}
                value={stats.activePatients}
                prefix={<RiseOutlined />}
                valueStyle={{ color: '#52c41a' }}
              />
            </Card>
          </Col>
          <Col span={8}>
            <Card>
              <Statistic
                title={t('patients:statistics.totalHouseholds')}
                value={stats.totalHouseholds}
                prefix={<HomeOutlined />}
                valueStyle={{ color: '#4A90E2' }}
              />
            </Card>
          </Col>
        </Row>

        {/* Data Tables with integrated search */}
        <Card>
          <Tabs
            activeKey={activeView}
            onChange={(key) => {
              if (key === 'patients') setCurrentView('animal');
              else if (key === 'households') setCurrentView('household');
              else if (key === 'appointments') setCurrentView('appointments');
            }}
            tabBarExtraContent={
              <Space>
                <Button
                  variant="secondary"
                  iconType="setting"
                  onClick={() => navigate('/settings')}
                >
                  {t('navigation:settings')}
                </Button>
                {import.meta.env.DEV && (
                  <Button
                    variant="secondary"
                    onClick={() => setSeedOpen(true)}
                  >
                    Seed DB
                  </Button>
                )}
                <Button
                  variant="primary"
                  iconType="plus"
                  onClick={() => {
                    if (activeView === 'patients') {
                      setShowPatientForm(true);
                    } else if (activeView === 'households') {
                      setShowHouseholdForm(true);
                    }
                  }}
                  style={{ display: activeView === 'appointments' ? 'none' : 'inline-flex' }}
                >
                  {activeView === 'patients' ? t('patients:addPatient') : t('patients:addHousehold')}
                </Button>
              </Space>
            }
            items={[
              {
                key: 'patients',
                label: (
                  <span>
                    <HeartOutlined />
                    {t('navigation:patients')}
                  </span>
                ),
                children: filteredPatients.length > 0 || patients.length > 0 ? (
                  <PatientTable
                    patients={filteredPatients}
                    onView={handleViewPatient}
                    onEdit={handleEditPatient}
                    onDelete={handleDeletePatient}
                  />
                ) : (
                  <NoData />
                ),
              },
              {
                key: 'households',
                label: (
                  <span>
                    <TeamOutlined />
                    {t('navigation:households')}
                  </span>
                ),
                children: filteredHouseholds.length > 0 || households.length > 0 ? (
                  <HouseholdTable
                    households={filteredHouseholds}
                    onView={handleViewHousehold}
                    onEdit={handleEditHousehold}
                    onDelete={handleDeleteHousehold}
                  />
                ) : (
                  <NoData />
                ),
              },
              {
                key: 'appointments',
                label: (
                  <span>
                    <CalendarOutlined />
                    {t('navigation:appointments')}
                  </span>
                ),
                children: <AppointmentsTab />,
              },
            ]}
          />
        </Card>
      </Space>

      {/* Patient Form Modal */}
      <FormModal
        title={selectedPatient ? t('patients:editPatient') : t('patients:addPatient')}
        open={showPatientForm}
        onCancel={() => {
          setShowPatientForm(false);
          setSelectedPatient(null);
        }}
        footer={null}
        width={800}
      >
        <PatientFormWithOwner
          patient={selectedPatient || undefined}
          onSubmit={handleSavePatient}
          onCancel={() => {
            setShowPatientForm(false);
            setSelectedPatient(null);
          }}
        />
      </FormModal>

      {/* Household Form Modal */}
      <FormModal
        title={selectedHousehold ? t('patients:editHousehold') : t('patients:addHousehold')}
        open={showHouseholdForm}
        onCancel={() => {
          setShowHouseholdForm(false);
          setSelectedHousehold(null);
        }}
        footer={null}
        width={800}
      >
        <HouseholdForm
          initialValues={selectedHousehold || undefined}
          onSubmit={handleSaveHousehold}
          onCancel={() => {
            setShowHouseholdForm(false);
            setSelectedHousehold(null);
          }}
        />
      </FormModal>

      {/* Seed Database Modal (dev only) */}
      <Modal
        title="Seed Database"
        open={seedOpen}
        onOk={handleSeed}
        confirmLoading={seeding}
        onCancel={() => !seeding && setSeedOpen(false)}
        okText={seeding ? 'Seeding...' : 'Seed'}
      >
        <p>Populate the database with demo data:</p>
        <ul>
          <li>Households: N (each with 1–5 pets)</li>
          <li>Each pet: 1–5 procedures and 1–5 notes</li>
        </ul>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>Households:</span>
          <InputNumber
            min={1}
            max={100000}
            value={seedCount}
            onChange={(v) => {
              // v can be null or number from Ant Design InputNumber
              const value = v === null || v === undefined ? 1000 : Number(v);
              console.log('[FRONTEND] Seed count changed to:', value, 'from input:', v);
              setSeedCount(value);
            }}
          />
        </div>
      </Modal>
    </div>
  );
};
