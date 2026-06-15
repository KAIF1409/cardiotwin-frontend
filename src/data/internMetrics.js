// Real baseline metrics from Intern 1 MRI + Intern 2 physics model
// metrics.json: EF=59.9%, EDV=85.1ml, ESV=34.1ml, Wall=5.5mm

import metricsData from './metrics.json'

export const baselineMetrics = {
  ef:            metricsData?.cardiac_function?.EF_pct    ?? 59.9,
  edv:           metricsData?.cardiac_function?.EDV_mL    ?? 85.1,
  esv:           metricsData?.cardiac_function?.ESV_mL    ?? 34.1,
  sv:            metricsData?.cardiac_function?.SV_mL     ?? 50.9,
  efStatus:      metricsData?.cardiac_function?.EF_status ?? 'Normal (55–70%)',
  wallThickness: metricsData?.wall_thickness_mm           ?? 5.5,
  // Valve geometry from metrics.json
  valveArea:     metricsData?.valve_geometry?.annulus_area_mm2 ?? 456.5,
  semiMajor:     metricsData?.valve_geometry?.semi_major_axis_mm ?? 13.78,
  semiMinor:     metricsData?.valve_geometry?.semi_minor_axis_mm ?? 10.54,
}

export default baselineMetrics