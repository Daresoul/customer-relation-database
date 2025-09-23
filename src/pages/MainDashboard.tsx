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
} from '@ant-design/icons';
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
import { useViewContext } from '../contexts/ViewContext';
import api, { setAppInstance } from '../services/api.integration';
import notifications from '../services/notifications';
import type { Patient, PatientWithHousehold } from '../types';
import type { HouseholdTableRecord } from '../types/ui.types';

// Removed TabPane - using items prop instead

export const MainDashboard: React.FC = () => {
  const { currentView, setCurrentView } = useViewContext();
  const app = App.useApp();
  const activeView = currentView === 'animal' ? 'patients' : 'households';
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
      // Use the existing search APIs to get data
      const [patientsResults, householdsResults] = await Promise.all([
        api.patient.search('', 1000), // Get all patients
        api.household.search('', 1000), // Get all households
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

      // Calculate real statistics
      setStats({
        totalPatients: patientsResults.length,
        activePatients: patientsResults.filter(p => p.isActive !== false).length,
        totalHouseholds: householdsResults.length,
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
    try {
      const households = Math.max(1, Math.min(5000, Number(seedCount) || 1000));
      const res = await invoke<string>('populate_database', { households });
      app.message.success(res || `Seeded ${households} households`);
      setSeedOpen(false);
      await loadData();
    } catch (e: any) {
      app.message.error(e?.message || 'Failed to seed database');
      console.error('Seed error:', e);
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
    if (!window.confirm(`Are you sure you want to delete ${patient.name}?`)) {
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
    if (!window.confirm(`Are you sure you want to delete ${household.lastName} household?`)) {
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
    return <PageLoader message="Loading dashboard..." />;
  }

  // Simplified layout without header

  return (
    <div style={{ background: '#141414', padding: '24px' }}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* Statistics Cards */}
        <Row gutter={16}>
          <Col span={8}>
            <Card>
              <Statistic
                title="Total Patients"
                value={stats.totalPatients}
                prefix={<HeartOutlined />}
                valueStyle={{ color: '#ff69b4' }}
              />
            </Card>
          </Col>
          <Col span={8}>
            <Card>
              <Statistic
                title="Active Patients"
                value={stats.activePatients}
                prefix={<RiseOutlined />}
                valueStyle={{ color: '#52c41a' }}
              />
            </Card>
          </Col>
          <Col span={8}>
            <Card>
              <Statistic
                title="Total Households"
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
            onChange={(key) => setCurrentView(key === 'patients' ? 'animal' : 'household')}
            tabBarExtraContent={
              <Space>
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
                    } else {
                      setShowHouseholdForm(true);
                    }
                  }}
                >
                  Add {activeView === 'patients' ? 'Patient' : 'Household'}
                </Button>
              </Space>
            }
            items={[
              {
                key: 'patients',
                label: (
                  <span>
                    <HeartOutlined />
                    Patients
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
                    Households
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
            ]}
          />
        </Card>
      </Space>

      {/* Patient Form Modal */}
      <FormModal
        title={selectedPatient ? 'Edit Patient' : 'Add New Patient'}
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
        title={selectedHousehold ? 'Edit Household' : 'Add New Household'}
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
            max={5000}
            value={seedCount}
            onChange={(v) => setSeedCount(Number(v) || 1000)}
          />
        </div>
      </Modal>
    </div>
  );
};
