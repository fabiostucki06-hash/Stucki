import type { Antrieb, Getriebe, Steuertrieb } from '../types';

/* ── Motorkatalog: factory engines per model / generation ──
   Built in, no external service: when the VIN (or the user) names the model but
   not the engine, the form offers these as one-tap chips that fill Antrieb,
   Getriebe, Motor, Motorkennbuchstabe and Steuertrieb (lib/vin, VehicleForm).
   Covers the common engines of the Swiss market, not every variant ever built.
   A Motorkennbuchstabe is only given where it is the same for the variant;
   otherwise the engine family is named and the exact code stays to be read off
   the Fahrzeugausweis / Datenträger. The Steuertrieb is given per engine family. */

/** One factory engine configuration (also the shape of the AI lookup's variants). */
export interface VinVariante {
  motor: string;
  motorcode: string;
  antrieb: Antrieb | '';
  getriebe: Getriebe | '';
  steuertrieb: Steuertrieb | '';
  hinweis: string;
}

const v = (motor: string, motorcode: string, antrieb: Antrieb, steuertrieb: Steuertrieb | '', hinweis = '', getriebe: Getriebe | '' = ''): VinVariante =>
  ({ motor, motorcode, antrieb, getriebe, steuertrieb, hinweis });
const B = 'benzin', D = 'diesel', H = 'hybrid', P = 'plugin', E = 'elektro';
const Z = 'zahnriemen', K = 'kette';

/* VAG */
const PQ35: VinVariante[] = [
  v('1.2 TSI · 77 kW (105 PS)', 'CBZB', B, K, 'EA111'),
  v('1.4 TSI · 90 kW (122 PS)', 'CAXA', B, K, 'EA111'),
  v('1.4 TSI · 118 kW (160 PS)', 'CAVD', B, K, 'EA111 Twincharger'),
  v('1.6 MPI · 75 kW (102 PS)', 'BSE', B, Z, 'EA113'),
  v('1.8 TSI · 118 kW (160 PS)', 'CDAA', B, K, 'EA888'),
  v('2.0 TSI · 155 kW (211 PS)', 'CCZB', B, K, 'EA888 (GTI)'),
  v('1.6 TDI · 77 kW (105 PS)', 'CAYC', D, Z, 'EA189'),
  v('2.0 TDI · 103 kW (140 PS)', 'CFFB', D, Z, 'EA189'),
  v('2.0 TDI · 125 kW (170 PS)', 'CFGB', D, Z, 'EA189'),
];
const PQ35_ALT: VinVariante[] = [
  v('1.4 16V · 59 kW (80 PS)', 'BUD', B, Z, 'EA111'),
  v('1.6 FSI · 85 kW (115 PS)', 'BLF', B, K, 'EA111'),
  v('1.4 TSI · 90 kW (122 PS)', 'CAXA', B, K, 'EA111'),
  v('1.4 TSI · 125 kW (170 PS)', 'BLG', B, K, 'EA111 Twincharger'),
  v('2.0 TFSI · 147 kW (200 PS)', 'AXX / BWA', B, Z, 'EA113'),
  v('1.9 TDI · 77 kW (105 PS)', 'BKC / BXE / BLS', D, Z, 'EA188 Pumpe-Düse'),
  v('2.0 TDI · 103 kW (140 PS)', 'BKD / AZV', D, Z, 'EA188 Pumpe-Düse'),
];
const MQB: VinVariante[] = [
  v('1.0 TSI · 85 kW (115 PS)', 'CHZD', B, Z, 'EA211'),
  v('1.2 TSI · 63 kW (85 PS)', 'CJZB', B, Z, 'EA211'),
  v('1.2 TSI · 77 kW (105 PS)', 'CJZA', B, Z, 'EA211'),
  v('1.4 TSI · 92 kW (125 PS)', 'CZCA', B, Z, 'EA211'),
  v('1.4 TSI ACT · 110 kW (150 PS)', 'CZDA', B, Z, 'EA211'),
  v('1.5 TSI · 96 kW (130 PS)', 'DACB', B, Z, 'EA211 evo, ab 2017'),
  v('1.5 TSI ACT · 110 kW (150 PS)', 'DADA / DPCA', B, Z, 'EA211 evo, ab 2017'),
  v('1.8 TSI · 132 kW (180 PS)', 'CJSA', B, K, 'EA888 Gen3'),
  v('2.0 TSI · 162–169 kW (220–230 PS)', 'CHHA / CHHB', B, K, 'EA888 Gen3 (GTI)'),
  v('1.4 TSI Plug-in · 150 kW (204 PS)', 'CUKB', P, Z, 'GTE / e-tron, EA211', 'dsg'),
  v('1.6 TDI · 81 kW (110 PS)', 'CLHA / CXXB', D, Z, 'EA288'),
  v('2.0 TDI · 110 kW (150 PS)', 'CRBC / CRLB', D, Z, 'EA288'),
  v('2.0 TDI · 135 kW (184 PS)', 'CUNA', D, Z, 'EA288 (GTD)'),
];
const MQB_EVO: VinVariante[] = [
  v('1.0 TSI · 81 kW (110 PS)', 'DLAA', B, Z, 'EA211 evo'),
  v('1.5 TSI · 96 kW (130 PS)', '', B, Z, 'EA211 evo'),
  v('1.5 eTSI · 110 kW (150 PS)', '', B, Z, 'EA211 evo Mildhybrid', 'dsg'),
  v('2.0 TSI · 180 kW (245 PS)', '', B, K, 'EA888 evo4 (GTI)'),
  v('1.4 eHybrid · 150 kW (204 PS)', '', P, Z, 'EA211', 'dsg'),
  v('2.0 TDI · 85 kW (115 PS)', '', D, Z, 'EA288 evo'),
  v('2.0 TDI · 110 kW (150 PS)', '', D, Z, 'EA288 evo'),
];
const POLO_6R: VinVariante[] = [
  v('1.2 12V · 51 kW (70 PS)', 'CGPA', B, K, 'EA111 3-Zylinder'),
  v('1.4 16V · 63 kW (85 PS)', 'CGGB', B, Z, 'EA111'),
  v('1.2 TSI · 66–77 kW (90–105 PS)', 'CBZA / CBZB', B, K, 'EA111'),
  v('1.4 TSI · 132 kW (180 PS)', 'CAVE', B, K, 'GTI, EA111 Twincharger'),
  v('1.2 TDI · 55 kW (75 PS)', 'CFWA', D, Z, 'EA189'),
  v('1.6 TDI · 66–77 kW (90–105 PS)', 'CAYA / CAYB', D, Z, 'EA189'),
];
const POLO_AW: VinVariante[] = [
  v('1.0 MPI · 48–59 kW (65–80 PS)', 'CHYB / DKLA', B, Z, 'EA211'),
  v('1.0 TSI · 70–85 kW (95–115 PS)', 'DKRF / CHZL', B, Z, 'EA211'),
  v('2.0 TSI · 147 kW (200 PS)', 'DKZC', B, K, 'GTI, EA888'),
  v('1.6 TDI · 59–70 kW (80–95 PS)', 'DGTA / DGTD', D, Z, 'EA288'),
];
const VAG_B8: VinVariante[] = [
  v('1.8 TFSI · 88–118 kW (120–160 PS)', 'CDHA / CABB', B, K, 'EA888'),
  v('2.0 TFSI · 132–155 kW (180–211 PS)', 'CDNC / CAEB', B, K, 'EA888'),
  v('2.0 TDI · 88–105 kW (120–143 PS)', 'CAGA / CAGB', D, Z, 'EA189'),
  v('2.0 TDI · 130 kW (177 PS)', 'CGLC', D, Z, 'EA189'),
  v('3.0 TDI V6 · 176–180 kW (240–245 PS)', 'CCWA / CDUC', D, K, 'EA896 / EA897'),
];
const VAG_B9: VinVariante[] = [
  v('1.4 TFSI · 110 kW (150 PS)', 'CVNA', B, Z, 'EA211'),
  v('2.0 TFSI · 140–185 kW (190–252 PS)', '', B, K, 'EA888 Gen3'),
  v('2.0 TDI · 110–140 kW (150–190 PS)', '', D, Z, 'EA288'),
  v('3.0 TDI V6 · 160–210 kW (218–286 PS)', '', D, K, 'EA897'),
];
const VAG_SUV_MQB: VinVariante[] = [
  v('1.4 TSI · 92–110 kW (125–150 PS)', 'CZCA / CZEA', B, Z, 'EA211'),
  v('1.5 TSI · 96–110 kW (130–150 PS)', 'DADA / DPCA', B, Z, 'EA211 evo, ab 2018'),
  v('2.0 TSI · 132–162 kW (180–220 PS)', 'CZPA / DKTB', B, K, 'EA888 Gen3'),
  v('1.6 TDI · 85 kW (115 PS)', 'DCXA', D, Z, 'EA288'),
  v('2.0 TDI · 85–110 kW (115–150 PS)', 'DFGA / DFHA', D, Z, 'EA288'),
  v('2.0 TDI · 140 kW (190 PS)', 'DFHA', D, Z, 'EA288'),
];
const TIGUAN_5N: VinVariante[] = [
  v('1.4 TSI · 90–118 kW (122–160 PS)', 'CAXA / CAVA / CTHA', B, K, 'EA111'),
  v('2.0 TSI · 125–155 kW (170–211 PS)', 'CAWA / CCZA', B, K, 'EA888'),
  v('2.0 TDI · 81–125 kW (110–170 PS)', 'CBAB / CFFB / CFGB', D, Z, 'EA189'),
];
const PASSAT_B8: VinVariante[] = [
  v('1.4 TSI · 92–110 kW (125–150 PS)', 'CZCA / CZEA', B, Z, 'EA211'),
  v('1.5 TSI · 110 kW (150 PS)', 'DPCA', B, Z, 'EA211 evo, ab 2019'),
  v('2.0 TSI · 162–200 kW (220–272 PS)', 'CHHB / DJHB', B, K, 'EA888 Gen3'),
  v('1.4 TSI Plug-in · 160 kW (218 PS)', 'CUKC', P, Z, 'GTE', 'dsg'),
  v('1.6 TDI · 88 kW (120 PS)', 'DCXA', D, Z, 'EA288'),
  v('2.0 TDI · 110 kW (150 PS)', 'CRLB / DFGA', D, Z, 'EA288'),
  v('2.0 TDI · 140 kW (190 PS)', 'CUAA / DFCA', D, Z, 'EA288'),
  v('2.0 BiTDI · 176 kW (240 PS)', 'CUAA', D, Z, 'EA288'),
];
const PASSAT_B6: VinVariante[] = [
  v('1.4 TSI · 90 kW (122 PS)', 'CAXA', B, K, 'EA111'),
  v('1.8 TSI · 118 kW (160 PS)', 'BZB / CDAA', B, K, 'EA888'),
  v('2.0 TSI · 147 kW (200 PS)', 'CCZA', B, K, 'EA888'),
  v('1.9 TDI · 77 kW (105 PS)', 'BKC / BXE / BLS', D, Z, 'EA188 Pumpe-Düse'),
  v('2.0 TDI · 103 kW (140 PS)', 'BKP / BMP / CBAB / CFFB', D, Z, 'EA188 / EA189'),
  v('2.0 TDI · 125 kW (170 PS)', 'BMR / CBBB / CFGB', D, Z, 'EA188 / EA189'),
];
const T5: VinVariante[] = [
  v('1.9 TDI · 63–77 kW (86–105 PS)', 'AXB / AXC', D, Z, 'Pumpe-Düse'),
  v('2.0 TDI · 62–132 kW (84–180 PS)', 'CAAA / CAAB / CAAC / CFCA', D, Z, 'EA189, ab 2009'),
  v('2.5 TDI R5 · 96–128 kW (130–174 PS)', 'AXD / AXE / BNZ', D, '', 'Nockenwelle über Zahnräder'),
  v('2.0 TSI · 150 kW (204 PS)', 'CJKB', B, K, 'EA888'),
];
const T6: VinVariante[] = [
  v('2.0 TDI · 62–150 kW (84–204 PS)', 'CXHA / CXFA / CXEB / CXGB', D, Z, 'EA288'),
  v('2.0 TSI · 110–150 kW (150–204 PS)', 'CJKA / CJKB', B, K, 'EA888'),
];
const CADDY_2K: VinVariante[] = [
  v('1.2 TSI · 77 kW (105 PS)', 'CBZB', B, K, 'EA111'),
  v('1.6 MPI · 75 kW (102 PS)', 'BSE / BSU', B, Z, 'EA113'),
  v('1.9 TDI · 77 kW (105 PS)', 'BLS / BJB', D, Z, 'Pumpe-Düse'),
  v('1.6 TDI · 55–75 kW (75–102 PS)', 'CAYD / CAYE', D, Z, 'EA189'),
  v('2.0 TDI · 81–103 kW (110–140 PS)', 'CFHC / CFJA', D, Z, 'EA189'),
  v('2.0 SDI · 51 kW (70 PS)', 'BST', D, Z, 'Saugdiesel'),
];

/* BMW / Mini: all current engines with timing chain */
const BMW_N: VinVariante[] = [
  v('116i/118i · 1.6 Turbo', 'N13B16', B, K, 'bis 2015'),
  v('118i/318i · 1.5 3-Zyl.', 'B38B15', B, K, 'ab 2015'),
  v('320i/328i · 2.0 Turbo', 'N20B20', B, K, '2011–2016'),
  v('320i/330i · 2.0 Turbo', 'B48B20', B, K, 'ab 2015'),
  v('335i · 3.0 Turbo', 'N55B30', B, K, ''),
  v('340i · 3.0 Turbo', 'B58B30', B, K, 'ab 2015'),
  v('330e Plug-in · 2.0 Turbo', 'B48B20', P, K, '', 'automat'),
  v('116d/118d/316d/318d/320d · 2.0', 'N47D20', D, K, '2007–2015, Kette hinten am Getriebe'),
  v('116d/118d/318d/320d · 2.0', 'B47D20', D, K, 'ab 2015'),
  v('116d · 1.5 3-Zyl.', 'B37C15', D, K, 'ab 2015'),
  v('325d/330d/530d · 3.0', 'N57D30', D, K, '2008–2016'),
  v('330d/530d/X5 30d · 3.0', 'B57D30', D, K, 'ab 2015'),
];
const BMW_E: VinVariante[] = [
  v('318i/320i · 2.0', 'N46B20', B, K, 'bis 2007'),
  v('318i/320i · 2.0', 'N43B20', B, K, '2007–2011'),
  v('325i/330i · R6', 'N52B25 / N52B30 / N53B30', B, K, ''),
  v('335i · 3.0 Turbo', 'N54B30 / N55B30', B, K, ''),
  v('318d/320d · 2.0', 'M47D20', D, K, 'bis 2007'),
  v('318d/320d · 2.0', 'N47D20', D, K, 'ab 2007, Kette hinten'),
  v('325d/330d · 3.0', 'M57D30 / N57D30', D, K, ''),
];
const MINI: VinVariante[] = [
  v('One / Cooper · 1.4/1.6', 'N12B14 / N12B16 / N16B16', B, K, 'R56, bis 2014'),
  v('Cooper S · 1.6 Turbo', 'N14B16 / N18B16', B, K, 'R56'),
  v('Cooper D · 1.6 (PSA)', 'W16D16', D, Z, 'R56 bis 2010, PSA DV6'),
  v('Cooper D · 1.6', 'N47C16', D, K, 'R56 ab 2010'),
  v('One / Cooper · 1.2/1.5 3-Zyl.', 'B38A12 / B38A15', B, K, 'F56, ab 2014'),
  v('Cooper S · 2.0 Turbo', 'B48A20', B, K, 'F56'),
  v('Cooper D · 1.5 3-Zyl.', 'B37C15', D, K, 'F56'),
];

/* Mercedes: timing chain except the Renault 1.5 dCi */
const MB_C204: VinVariante[] = [
  v('C 180/200 · 1.8 Kompressor/CGI', 'M271', B, K, ''),
  v('C 250 / C 280 / C 350 · V6', 'M272 / M276', B, K, ''),
  v('C 200/220/250 CDI · 2.1', 'OM651', D, K, 'ab 2008'),
  v('C 200/220 CDI · 2.1', 'OM646', D, K, 'bis 2008'),
  v('C 320/350 CDI · 3.0 V6', 'OM642', D, K, ''),
];
const MB_C205: VinVariante[] = [
  v('C 160/180/200 · 1.6/2.0', 'M274', B, K, 'bis 2018'),
  v('C 200 · 1.5 EQ Boost', 'M264', B, K, 'ab 2018'),
  v('C 300 / C 43 AMG', 'M274 / M276', B, K, ''),
  v('C 180 d · 1.6', 'OM626', D, K, 'Renault R9M'),
  v('C 200 d/220 d/250 d · 2.1', 'OM651', D, K, 'bis 2018'),
  v('C 200 d/220 d/300 d · 2.0', 'OM654', D, K, 'ab 2018'),
  v('C 350 e Plug-in', 'M274', P, K, '', 'automat'),
];
const MB_A176: VinVariante[] = [
  v('A 160/180/200/250 · 1.6/2.0', 'M270', B, K, ''),
  v('A 180 d / A 180 CDI · 1.5', 'OM607', D, Z, 'Renault K9K'),
  v('A 200 d/220 d · 2.1 / 2.2', 'OM651', D, K, ''),
];
const MB_A177: VinVariante[] = [
  v('A 180/200 · 1.33', 'M282', B, K, 'Renault-Nissan HR13'),
  v('A 220/250 · 2.0', 'M260', B, K, ''),
  v('A 180 d · 1.5', 'OM608', D, Z, 'Renault K9K'),
  v('A 200 d/220 d · 2.0', 'OM654q', D, K, ''),
  v('A 250 e Plug-in', 'M282', P, K, '', 'dsg'),
];
const MB_E212: VinVariante[] = [
  v('E 200/250 · 1.8 CGI', 'M271', B, K, ''),
  v('E 200/250 · 2.0', 'M274', B, K, 'ab 2013'),
  v('E 350 · V6', 'M272 / M276', B, K, ''),
  v('E 200/220/250 CDI · 2.1', 'OM651', D, K, ''),
  v('E 300/350 CDI · 3.0 V6', 'OM642', D, K, ''),
];
const MB_E213: VinVariante[] = [
  v('E 200/300 · 2.0', 'M274 / M264', B, K, ''),
  v('E 200 d/220 d · 2.0', 'OM654', D, K, ''),
  v('E 350 d / E 400 d · 3.0', 'OM642 / OM656', D, K, ''),
  v('E 300 e / E 300 de Plug-in', 'M274 / OM654', P, K, '', 'automat'),
];
const MB_VAN: VinVariante[] = [
  v('2.2 CDI · OM646', 'OM646', D, K, 'bis 2009'),
  v('2.1 CDI · OM651', 'OM651', D, K, 'ab 2009'),
  v('3.0 V6 CDI · OM642', 'OM642', D, K, ''),
  v('1.6 CDI · OM622', 'OM622', D, K, 'Vito 447, Renault R9M'),
  v('2.0 CDI · OM654', 'OM654', D, K, 'ab 2019'),
];

/* Opel */
const OPEL_F0_F1: VinVariante[] = [
  v('1.0 12V · 44 kW (60 PS)', 'Z10XEP / A10XEP', B, K, 'Family 0'),
  v('1.2 16V · 59–63 kW (80–86 PS)', 'Z12XEP / A12XER', B, K, 'Family 0'),
  v('1.4 16V · 66–74 kW (90–101 PS)', 'Z14XEP / A14XER', B, K, 'Family 0'),
  v('1.4 Turbo · 88–103 kW (120–140 PS)', 'A14NET / B14NET', B, K, ''),
  v('1.6 16V · 85 kW (115 PS)', 'Z16XER / A16XER', B, Z, 'Family 1'),
  v('1.6 Turbo · 132 kW (180 PS)', 'A16LET', B, Z, 'Family 1'),
  v('1.8 16V · 103 kW (140 PS)', 'Z18XER / A18XER', B, Z, 'Family 1'),
  v('1.3 CDTI · 55–70 kW (75–95 PS)', 'Z13DTJ / A13DTE', D, K, 'Fiat Multijet'),
  v('1.6 CDTI · 81–100 kW (110–136 PS)', 'B16DTH / B16DTL', D, K, ''),
  v('1.9 CDTI · 88–110 kW (120–150 PS)', 'Z19DT / Z19DTH', D, Z, 'Fiat JTD'),
  v('2.0 CDTI · 81–143 kW (110–195 PS)', 'A20DTH / A20DTJ / B20DTH', D, Z, ''),
];
const OPEL_PSA: VinVariante[] = [
  v('1.2 · 55 kW (75 PS)', 'F12XEL', B, Z, 'PSA EB2, Riemen im Öl'),
  v('1.2 Turbo · 74–96 kW (100–130 PS)', 'F12XHL / F12XHT', B, Z, 'PSA PureTech EB2, Riemen im Öl'),
  v('1.5 Diesel · 75–96 kW (102–130 PS)', 'F15DT', D, Z, 'PSA DV5'),
];

/* Ford */
const FORD_KLEIN: VinVariante[] = [
  v('1.0 EcoBoost · 74–92 kW (100–125 PS)', 'M1JA / M1DA / SFJA', B, Z, 'Riemen im Öl'),
  v('1.25 / 1.4 Duratec · 44–71 kW (60–96 PS)', 'STJA / SNJA / SPJA', B, Z, 'Sigma'),
  v('1.6 Ti-VCT · 77–92 kW (105–125 PS)', 'IQJA / PNDA', B, Z, 'Sigma'),
  v('1.6 EcoBoost · 134–147 kW (182–200 PS)', 'JTJA', B, Z, 'ST'),
  v('1.4 TDCi · 50–51 kW (68–70 PS)', 'F6JA / KVJA', D, Z, 'PSA DV4'),
  v('1.5 / 1.6 TDCi · 55–85 kW (75–115 PS)', 'XUJA / T1JA / TZJA', D, Z, 'PSA DV6'),
];
const FORD_FOCUS3: VinVariante[] = [
  v('1.0 EcoBoost · 74–92 kW (100–125 PS)', 'M1DA / M2DA', B, Z, 'Riemen im Öl'),
  v('1.6 Ti-VCT · 63–92 kW (85–125 PS)', 'IQDB / PNDA', B, Z, 'Sigma'),
  v('1.5 / 1.6 EcoBoost · 110–134 kW (150–182 PS)', 'M8DA / JQDA', B, Z, 'Sigma-Basis'),
  v('2.0 EcoBoost · 184 kW (250 PS)', 'R9DA', B, K, 'ST, Duratec HE'),
  v('1.5 / 1.6 TDCi · 70–88 kW (95–120 PS)', 'XWDB / T1DA / XXDA', D, Z, 'PSA DV6'),
  v('2.0 TDCi · 85–136 kW (115–185 PS)', 'UFDB / TXDA', D, Z, 'PSA DW10'),
];
const FORD_FOCUS4: VinVariante[] = [
  v('1.0 EcoBoost · 63–114 kW (85–155 PS)', '', B, Z, 'Riemen im Öl, ab 2018'),
  v('1.5 EcoBoost · 110–134 kW (150–182 PS)', '', B, '', 'Dragon 3-Zylinder'),
  v('2.3 EcoBoost · 206 kW (280 PS)', '', B, K, 'ST'),
  v('1.5 EcoBlue · 70–88 kW (95–120 PS)', '', D, Z, ''),
  v('2.0 EcoBlue · 110–140 kW (150–190 PS)', '', D, Z, 'Riemen im Öl'),
];
const FORD_KUGA2: VinVariante[] = [
  v('1.5 EcoBoost · 88–134 kW (120–182 PS)', '', B, Z, 'Sigma-Basis'),
  v('1.6 EcoBoost · 110–134 kW (150–182 PS)', 'JQMA', B, Z, ''),
  v('2.0 TDCi · 88–132 kW (120–180 PS)', 'UFMA / T7MA', D, Z, 'PSA DW10'),
  v('1.5 TDCi · 88 kW (120 PS)', '', D, Z, 'PSA DV6'),
];
const FORD_TRANSIT: VinVariante[] = [
  v('2.2 TDCi · 74–114 kW (100–155 PS)', 'CYF6 / CVR5', D, K, 'Duratorq Puma'),
  v('2.0 EcoBlue · 77–125 kW (105–170 PS)', '', D, Z, 'Riemen im Öl, ab 2016'),
  v('1.0 EcoBoost · 74 kW (100 PS)', '', B, Z, 'Courier, Riemen im Öl'),
];
const FORD_MONDEO4: VinVariante[] = [
  v('1.6 Ti-VCT · 92 kW (125 PS)', 'PNBA', B, Z, 'Sigma'),
  v('2.0 Duratec · 107 kW (145 PS)', 'AOBA', B, K, 'Duratec HE'),
  v('2.0 EcoBoost · 149–176 kW (203–240 PS)', 'TNBA', B, K, ''),
  v('1.6 TDCi · 85 kW (115 PS)', 'T1BA', D, Z, 'PSA DV6'),
  v('1.8 TDCi · 74–92 kW (100–125 PS)', 'QYBA', D, K, 'Duratorq Lynx'),
  v('2.0 TDCi · 85–120 kW (115–163 PS)', 'QXBA / UFBA', D, Z, 'PSA DW10'),
];

/* Renault / Dacia / Nissan alliance */
const RENAULT: VinVariante[] = [
  v('1.2 16V · 55 kW (75 PS)', 'D4F', B, Z, ''),
  v('1.4 / 1.6 16V · 72–82 kW (98–112 PS)', 'K4J / K4M', B, Z, ''),
  v('1.6 MPI 8V · 62–64 kW (84–87 PS)', 'K7M', B, Z, ''),
  v('0.9 TCe · 66 kW (90 PS)', 'H4B', B, K, 'ab 2012'),
  v('1.0 TCe · 67–74 kW (91–101 PS)', 'H4D', B, K, 'ab 2019'),
  v('1.2 TCe · 85–96 kW (115–130 PS)', 'H5F', B, K, '2012–2018'),
  v('1.3 TCe · 96–117 kW (130–160 PS)', 'H5H', B, K, 'ab 2018'),
  v('1.5 dCi / Blue dCi · 50–85 kW (68–115 PS)', 'K9K', D, Z, ''),
  v('1.6 dCi · 96–118 kW (130–160 PS)', 'R9M', D, K, ''),
  v('1.9 dCi · 66–96 kW (90–130 PS)', 'F9Q', D, Z, ''),
  v('2.0 dCi · 110–127 kW (150–173 PS)', 'M9R', D, K, ''),
];
const NISSAN_ALLIANZ: VinVariante[] = [
  v('1.2 DIG-T · 85 kW (115 PS)', 'HRA2DDT', B, K, 'Renault H5F'),
  v('1.3 DIG-T · 103–117 kW (140–160 PS)', 'HR13DDT', B, K, 'ab 2018'),
  v('1.6 · 86 kW (117 PS)', 'HR16DE', B, K, ''),
  v('1.6 DIG-T · 120–140 kW (163–190 PS)', 'MR16DDT', B, K, ''),
  v('2.0 · 104 kW (141 PS)', 'MR20DE', B, K, ''),
  v('1.5 dCi · 63–81 kW (86–110 PS)', 'K9K', D, Z, 'Renault'),
  v('1.6 dCi · 96 kW (130 PS)', 'R9M', D, K, 'Renault'),
  v('2.0 dCi · 110–127 kW (150–173 PS)', 'M9R', D, K, 'Renault'),
];
const NISSAN_KLEIN: VinVariante[] = [
  v('1.2 · 48–59 kW (65–80 PS)', 'CR12DE / HR12DE', B, K, ''),
  v('1.4 · 65 kW (88 PS)', 'CR14DE', B, K, ''),
  v('1.2 DIG-S · 72 kW (98 PS)', 'HR12DDR', B, K, ''),
  v('0.9 IG-T · 66 kW (90 PS)', 'H4B', B, K, 'Micra K14, Renault'),
  v('1.5 dCi · 50–66 kW (68–90 PS)', 'K9K', D, Z, 'Renault'),
];
const NISSAN_XTRAIL: VinVariante[] = [
  v('2.0 · 104 kW (141 PS)', 'MR20DE', B, K, 'T31'),
  v('2.5 · 124 kW (169 PS)', 'QR25DE', B, K, ''),
  v('1.6 DIG-T · 120 kW (163 PS)', 'MR16DDT', B, K, 'T32'),
  v('2.0 / 2.2 dCi · 84–110 kW (114–150 PS)', 'YD22DDTi / M9R', D, K, 'T30 / T31'),
  v('1.6 dCi · 96 kW (130 PS)', 'R9M', D, K, 'T32, Renault'),
  v('2.0 dCi · 130 kW (177 PS)', 'M9R', D, K, 'T32, Renault'),
];
const NISSAN_NAVARA: VinVariante[] = [
  v('2.5 dCi · 98–140 kW (133–190 PS)', 'YD25DDTi', D, K, 'D40'),
  v('3.0 V6 dCi · 170 kW (231 PS)', 'V9X', D, K, 'D40, Renault'),
  v('2.3 dCi · 118–140 kW (160–190 PS)', 'YS23DDT', D, K, 'D23'),
];

/* PSA (Peugeot / Citroën / DS) */
const PSA: VinVariante[] = [
  v('1.0 VTi · 50 kW (68 PS)', 'EB0', B, Z, 'Riemen im Öl'),
  v('1.2 PureTech · 60–96 kW (82–130 PS)', 'EB2', B, Z, 'Riemen im Öl, ab 2012'),
  v('1.4 VTi · 70 kW (95 PS)', 'EP3', B, K, 'Prince'),
  v('1.6 VTi · 88 kW (120 PS)', 'EP6C', B, K, 'Prince'),
  v('1.6 THP · 110–200 kW (150–272 PS)', 'EP6CDT', B, K, 'Prince'),
  v('1.4 / 1.6 8V/16V · 55–80 kW (75–109 PS)', 'TU3 / TU5', B, Z, 'bis ~2012'),
  v('2.0 16V · 103 kW (140 PS)', 'EW10', B, Z, ''),
  v('1.4 HDi · 50 kW (68 PS)', 'DV4', D, Z, ''),
  v('1.5 BlueHDi · 75–96 kW (102–130 PS)', 'DV5', D, Z, 'ab 2017'),
  v('1.6 HDi / BlueHDi · 55–88 kW (75–120 PS)', 'DV6', D, Z, ''),
  v('2.0 HDi / BlueHDi · 100–133 kW (136–180 PS)', 'DW10', D, Z, ''),
];

/* Toyota / Lexus: timing chain throughout, except the old D-4D 2.5/3.0 */
const TOYOTA_YARIS3: VinVariante[] = [
  v('1.0 VVT-i · 51–53 kW (69–72 PS)', '1KR-FE', B, K, ''),
  v('1.33 Dual VVT-i · 73 kW (99 PS)', '1NR-FE', B, K, ''),
  v('1.5 Dual VVT-iE · 82 kW (111 PS)', '2NR-FKE', B, K, 'ab 2017'),
  v('1.5 Hybrid · 74 kW (100 PS)', '1NZ-FXE', H, K, '', 'cvt'),
  v('1.4 D-4D · 66 kW (90 PS)', '1ND-TV', D, K, ''),
];
const TOYOTA_YARIS4: VinVariante[] = [
  v('1.0 VVT-i · 53 kW (72 PS)', '1KR-FE', B, K, ''),
  v('1.5 Dynamic Force · 92 kW (125 PS)', 'M15A-FKS', B, K, ''),
  v('1.5 Hybrid · 85 kW (116 PS)', 'M15A-FXE', H, K, '', 'cvt'),
];
const TOYOTA_AURIS: VinVariante[] = [
  v('1.33 Dual VVT-i · 73 kW (99 PS)', '1NR-FE', B, K, ''),
  v('1.6 Valvematic · 97 kW (132 PS)', '1ZR-FAE', B, K, ''),
  v('1.2 Turbo · 85 kW (116 PS)', '8NR-FTS', B, K, 'ab 2015'),
  v('1.8 Hybrid · 100 kW (136 PS)', '2ZR-FXE', H, K, '', 'cvt'),
  v('1.4 D-4D · 66 kW (90 PS)', '1ND-TV', D, K, ''),
  v('2.0 D-4D · 93 kW (126 PS)', '1AD-FTV', D, K, ''),
];
const TOYOTA_COROLLA12: VinVariante[] = [
  v('1.2 Turbo · 85 kW (116 PS)', '8NR-FTS', B, K, ''),
  v('1.8 Hybrid · 90–103 kW (122–140 PS)', '2ZR-FXE', H, K, '', 'cvt'),
  v('2.0 Hybrid · 135 kW (184 PS)', 'M20A-FXS', H, K, '', 'cvt'),
];
const TOYOTA_RAV4: VinVariante[] = [
  v('2.0 Valvematic · 111 kW (151 PS)', '3ZR-FAE', B, K, 'XA40'),
  v('2.0 D-4D · 91–105 kW (124–143 PS)', '1AD-FTV', D, K, 'XA40'),
  v('2.5 Hybrid · 145 kW (197 PS)', '2AR-FXE', H, K, 'XA40', 'cvt'),
  v('2.5 Hybrid · 160 kW (218 PS)', 'A25A-FXS', H, K, 'XA50, ab 2019', 'cvt'),
  v('2.5 Plug-in · 225 kW (306 PS)', 'A25A-FXS', P, K, 'XA50', 'cvt'),
];
const TOYOTA_CHR: VinVariante[] = [
  v('1.2 Turbo · 85 kW (116 PS)', '8NR-FTS', B, K, ''),
  v('1.8 Hybrid · 90 kW (122 PS)', '2ZR-FXE', H, K, '', 'cvt'),
  v('2.0 Hybrid · 135 kW (184 PS)', 'M20A-FXS', H, K, 'ab 2019', 'cvt'),
];
const TOYOTA_HILUX: VinVariante[] = [
  v('2.5 D-4D · 75–106 kW (102–144 PS)', '2KD-FTV', D, Z, 'bis 2015'),
  v('3.0 D-4D · 126 kW (171 PS)', '1KD-FTV', D, Z, 'bis 2015'),
  v('2.4 D-4D · 110 kW (150 PS)', '2GD-FTV', D, K, 'ab 2016'),
  v('2.8 D-4D · 130–150 kW (177–204 PS)', '1GD-FTV', D, K, 'ab 2016'),
];
const TOYOTA_PRIUS: VinVariante[] = [
  v('1.8 Hybrid · 100 kW (136 PS)', '2ZR-FXE', H, K, '', 'cvt'),
  v('1.8 Plug-in · 100 kW (136 PS)', '2ZR-FXE', P, K, '', 'cvt'),
];

/* Honda: timing chain except the J V6 */
const HONDA_CIVIC8: VinVariante[] = [
  v('1.4 i-DSI · 61 kW (83 PS)', 'L13A', B, K, ''),
  v('1.8 i-VTEC · 103 kW (140 PS)', 'R18A', B, K, ''),
  v('2.0 i-VTEC Type R · 148 kW (201 PS)', 'K20Z4', B, K, ''),
  v('2.2 i-CTDi · 103 kW (140 PS)', 'N22A', D, K, ''),
];
const HONDA_CIVIC9: VinVariante[] = [
  v('1.4 i-VTEC · 73 kW (100 PS)', 'L13Z', B, K, ''),
  v('1.8 i-VTEC · 104 kW (142 PS)', 'R18Z', B, K, ''),
  v('2.0 VTEC Turbo Type R · 228 kW (310 PS)', 'K20C1', B, K, ''),
  v('1.6 i-DTEC · 88 kW (120 PS)', 'N16A', D, K, ''),
  v('2.2 i-DTEC · 110 kW (150 PS)', 'N22B', D, K, ''),
];
const HONDA_CIVIC10: VinVariante[] = [
  v('1.0 VTEC Turbo · 95 kW (129 PS)', 'P10A', B, '', ''),
  v('1.5 VTEC Turbo · 134 kW (182 PS)', 'L15B7', B, K, ''),
  v('2.0 VTEC Turbo Type R · 235 kW (320 PS)', 'K20C1', B, K, ''),
  v('1.6 i-DTEC · 88 kW (120 PS)', 'N16A', D, K, ''),
];
const HONDA_JAZZ: VinVariante[] = [
  v('1.2 i-VTEC · 66 kW (90 PS)', 'L12B', B, K, 'GE'),
  v('1.4 i-VTEC · 73 kW (100 PS)', 'L13Z', B, K, 'GE'),
  v('1.3 Hybrid · 72 kW (98 PS)', 'LDA', H, K, 'GE', 'cvt'),
  v('1.3 i-VTEC · 75 kW (102 PS)', 'L13B', B, K, 'GK'),
  v('1.5 i-MMD Hybrid · 80 kW (109 PS)', 'LEB', H, K, 'GR', 'cvt'),
];
const HONDA_CRV: VinVariante[] = [
  v('2.0 i-VTEC · 110–114 kW (150–155 PS)', 'R20A', B, K, ''),
  v('2.4 i-VTEC · 125 kW (170 PS)', 'K24', B, K, ''),
  v('2.2 i-CTDi · 103 kW (140 PS)', 'N22A', D, K, 'RE'),
  v('2.2 i-DTEC · 110 kW (150 PS)', 'N22B', D, K, ''),
  v('1.6 i-DTEC · 88–118 kW (120–160 PS)', 'N16A', D, K, 'RM'),
  v('2.0 i-MMD Hybrid · 135 kW (184 PS)', 'LFB', H, K, 'RW', 'cvt'),
];
const HONDA_HRV: VinVariante[] = [
  v('1.5 i-VTEC · 96 kW (130 PS)', 'L15B', B, K, ''),
  v('1.5 VTEC Turbo · 134 kW (182 PS)', 'L15B7', B, K, ''),
  v('1.6 i-DTEC · 88 kW (120 PS)', 'N16A', D, K, ''),
];
const HONDA_ACCORD: VinVariante[] = [
  v('2.0 i-VTEC · 114 kW (155 PS)', 'K20A / R20A', B, K, ''),
  v('2.4 i-VTEC · 140 kW (190 PS)', 'K24', B, K, ''),
  v('2.2 i-CTDi · 103 kW (140 PS)', 'N22A', D, K, ''),
  v('2.2 i-DTEC · 110–132 kW (150–180 PS)', 'N22B', D, K, ''),
];

/* Mazda */
const MAZDA_MZR: VinVariante[] = [
  v('1.3 / 1.5 MZR · 55–76 kW (75–103 PS)', 'ZJ / ZY', B, K, ''),
  v('1.6 MZR · 77 kW (105 PS)', 'Z6', B, K, ''),
  v('1.8 / 2.0 MZR · 88–110 kW (120–150 PS)', 'L8 / LF', B, K, ''),
  v('2.5 MZR · 125 kW (170 PS)', 'L5', B, K, ''),
  v('1.6 MZ-CD · 66–85 kW (90–115 PS)', 'Y6', D, Z, 'PSA DV6'),
  v('2.0 MZR-CD · 89–105 kW (121–143 PS)', 'RF7J', D, K, ''),
  v('2.2 MZR-CD · 92–136 kW (125–185 PS)', 'R2AA', D, K, ''),
];
const MAZDA_SKY: VinVariante[] = [
  v('1.5 SKYACTIV-G · 66–96 kW (90–131 PS)', 'P5', B, K, ''),
  v('2.0 SKYACTIV-G · 88–121 kW (120–165 PS)', 'PE', B, K, ''),
  v('2.5 SKYACTIV-G · 141 kW (192 PS)', 'PY', B, K, ''),
  v('2.0 SKYACTIV-X · 132 kW (180 PS)', 'HF', B, K, 'ab 2019'),
  v('1.5 SKYACTIV-D · 77 kW (105 PS)', 'S5', D, K, ''),
  v('1.8 SKYACTIV-D · 85 kW (116 PS)', 'S8', D, K, 'ab 2018'),
  v('2.2 SKYACTIV-D · 110–135 kW (150–184 PS)', 'SH', D, K, ''),
];

/* Hyundai / Kia */
const HK_ALT: VinVariante[] = [
  v('1.4 / 1.6 CVVT · 77–93 kW (105–126 PS)', 'G4FA / G4FC', B, K, 'Gamma'),
  v('2.0 CVVT · 105 kW (143 PS)', 'G4GC', B, Z, 'Beta'),
  v('1.6 CRDi · 66–85 kW (90–116 PS)', 'D4FB', D, K, 'U'),
  v('2.0 CRDi · 103 kW (140 PS)', 'D4EA', D, Z, ''),
];
const HK_NEU: VinVariante[] = [
  v('1.0 T-GDI · 74–88 kW (100–120 PS)', 'G3LC', B, K, 'Kappa'),
  v('1.2 MPI · 62 kW (84 PS)', 'G4LA', B, K, 'Kappa'),
  v('1.4 MPI · 73 kW (100 PS)', 'G4LC', B, K, 'Kappa'),
  v('1.4 T-GDI · 103 kW (140 PS)', 'G4LD', B, K, 'Kappa'),
  v('1.6 GDI · 99–100 kW (135–136 PS)', 'G4FD', B, K, 'Gamma'),
  v('1.6 T-GDI · 130–150 kW (177–204 PS)', 'G4FJ', B, K, 'Gamma'),
  v('1.6 GDI Hybrid · 104 kW (141 PS)', 'G4LE', H, K, 'Kappa', 'dsg'),
  v('1.4 CRDi · 66 kW (90 PS)', 'D4FC', D, K, 'U'),
  v('1.6 CRDi · 70–100 kW (95–136 PS)', 'D4FB / D4FE', D, K, 'U'),
];
const HK_SUV: VinVariante[] = [
  v('1.6 GDI · 97–99 kW (132–135 PS)', 'G4FD', B, K, 'Gamma'),
  v('1.6 T-GDI · 130 kW (177 PS)', 'G4FJ', B, K, 'Gamma'),
  v('2.0 CVVT / MPI · 120 kW (163 PS)', 'G4KD / G4NA', B, K, 'Theta / Nu'),
  v('1.7 CRDi · 85–104 kW (116–141 PS)', 'D4FD', D, K, 'U'),
  v('2.0 CRDi · 100–136 kW (136–185 PS)', 'D4HA', D, K, 'R'),
  v('2.2 CRDi · 145 kW (197 PS)', 'D4HB', D, K, 'R'),
];

/* Volvo */
const VOLVO_P3: VinVariante[] = [
  v('D2 · 1.6 · 84 kW (115 PS)', 'D4162T', D, Z, 'PSA DV6, bis 2015'),
  v('D2/D3/D4 · 2.0 4-Zyl. · 88–140 kW (120–190 PS)', 'D4204T', D, Z, 'VEA, ab 2014'),
  v('D3/D4/D5 · 2.0/2.4 5-Zyl. · 100–158 kW (136–215 PS)', 'D5204T / D5244T', D, Z, 'bis 2015'),
  v('T3/T4 · 1.6 Turbo · 110–132 kW (150–180 PS)', 'B4164T', B, Z, 'Ford EcoBoost'),
  v('T5 · 2.0 Turbo · 177 kW (240 PS)', 'B4204T6 / B4204T7', B, K, 'Ford EcoBoost, bis 2014'),
  v('T4/T5/T6 · 2.0 4-Zyl. · 140–225 kW (190–306 PS)', 'B4204T', B, Z, 'VEA, ab 2014'),
  v('T5/T6 · 5-Zyl.', 'B5254T', B, Z, ''),
];
const VOLVO_SPA: VinVariante[] = [
  v('D3/D4/D5 · 2.0 · 110–173 kW (150–235 PS)', 'D4204T', D, Z, 'VEA'),
  v('T4/T5/T6 · 2.0 · 140–235 kW (190–320 PS)', 'B4204T', B, Z, 'VEA'),
  v('T6/T8 Recharge Plug-in · 2.0', 'B4204T', P, Z, 'VEA', 'automat'),
  v('B4/B5 Mildhybrid · 2.0', 'B4204T / D4204T', B, Z, 'VEA, ab 2020'),
];
const VOLVO_XC40: VinVariante[] = [
  v('T2/T3 · 1.5 3-Zyl. · 95–120 kW (129–163 PS)', 'B3154T', B, Z, 'VEA'),
  v('T4/T5 · 2.0 · 140–184 kW (190–250 PS)', 'B4204T', B, Z, 'VEA'),
  v('T4/T5 Recharge Plug-in · 1.5', 'B3154T', P, Z, '', 'dsg'),
  v('D3/D4 · 2.0 · 110–140 kW (150–190 PS)', 'D4204T', D, Z, 'VEA'),
];

/* Fiat / Alfa Romeo */
const FIAT_KLEIN: VinVariante[] = [
  v('1.1 8V · 40 kW (54 PS)', '187A1000', B, Z, 'Fire'),
  v('1.2 8V · 51 kW (69 PS)', '169A4000', B, Z, 'Fire'),
  v('1.4 8V/16V · 57–74 kW (77–100 PS)', '', B, Z, 'Fire'),
  v('0.9 TwinAir · 51–63 kW (69–85 PS)', '312A2000', B, K, ''),
  v('1.0 Hybrid · 51 kW (70 PS)', '', B, K, 'FireFly, ab 2020'),
  v('1.3 Multijet · 55–70 kW (75–95 PS)', '', D, K, ''),
];
const FIAT_MITTEL: VinVariante[] = [
  v('1.4 16V · 70–77 kW (95–105 PS)', '', B, Z, 'Fire'),
  v('1.4 T-Jet / MultiAir · 88–125 kW (120–170 PS)', '', B, Z, 'Fire'),
  v('1.3 Multijet · 55–70 kW (75–95 PS)', '', D, K, ''),
  v('1.6 Multijet · 77–88 kW (105–120 PS)', '', D, Z, ''),
  v('1.9 / 2.0 Multijet · 88–125 kW (120–170 PS)', '', D, Z, ''),
];
const FIAT_DUCATO: VinVariante[] = [
  v('2.2 Multijet · 74–88 kW (100–120 PS)', '4HV', D, K, 'Ford Puma, bis 2011'),
  v('2.3 Multijet · 81–130 kW (110–177 PS)', 'F1AE', D, Z, 'Iveco'),
  v('3.0 Multijet · 115–130 kW (157–177 PS)', 'F1CE', D, K, 'Iveco'),
  v('2.2 Multijet3 · 88–132 kW (120–180 PS)', '', D, K, 'ab 2021'),
];
const ALFA: VinVariante[] = [
  v('1.4 TB / MultiAir · 88–125 kW (120–170 PS)', '', B, Z, 'Fire'),
  v('1750 TBi · 173–177 kW (235–240 PS)', '', B, K, ''),
  v('1.6 JTDM · 77–88 kW (105–120 PS)', '', D, Z, ''),
  v('2.0 JTDM · 103–129 kW (140–175 PS)', '', D, Z, ''),
  v('2.0 Turbo · 147–206 kW (200–280 PS)', '', B, K, 'Giulia / Stelvio'),
  v('2.2 Diesel · 100–154 kW (136–210 PS)', '', D, K, 'Giulia / Stelvio'),
];

/* Porsche: all with timing chain */
const PORSCHE_SUV: VinVariante[] = [
  v('2.0 Turbo · 185 kW (252 PS)', '', B, K, 'Macan, EA888'),
  v('3.0 / 2.9 V6 Turbo', '', B, K, ''),
  v('3.0 V6 Diesel · 155–193 kW (211–262 PS)', '', D, K, 'EA897'),
  v('3.6 V6 · 220–250 kW (300–340 PS)', '', B, K, ''),
  v('4.8 V8 · 294–382 kW (400–520 PS)', '', B, K, 'Cayenne'),
  v('Hybrid / E-Hybrid', '', P, K, '', 'automat'),
];

interface Eintrag { marken: string[]; modell: RegExp; jahre?: [number, number]; varianten: VinVariante[] }

const VAG = ['vw', 'audi', 'skoda', 'seat', 'cupra'];
const STELLANTIS = ['peugeot', 'citroen', 'ds'];

/** First match wins: specific generations before generic patterns. */
const KATALOG: Eintrag[] = [
  // VAG compact (Golf / A3 / Octavia / Leon) by generation
  { marken: VAG, modell: /golf\s*(viii|8)\b|\ba3\s*\(8y\)|octavia\s*(iv|4)\b|leon\s*\(kl\)/, varianten: MQB_EVO },
  { marken: VAG, modell: /golf\s*(vii|7)\b|\ba3\s*\(8v\)|octavia\s*(iii|3)\b|leon\s*\(5f\)|t-roc|\bkaroq\b|\bateca\b|superb\s*(iii|3)\b|touran\s*\(5t\)|\bq2\b|kodiaq|tiguan\s*\(ad\)|tiguan allspace|\bq3\s*\(f3\)|\barteon\b|\bscala\b|\bkamiq\b/, varianten: VAG_SUV_MQB.concat(MQB.filter((x) => !VAG_SUV_MQB.some((y) => y.motor === x.motor))) },
  { marken: VAG, modell: /golf\s*(vi|6)\b|\ba3\s*\(8p\)|octavia\s*(ii|2)\b|leon\s*\(1p\)|superb\s*(ii|2)\b|\byeti\b|\baltea\b|touran\s*\(1t\)|scirocco|\bq3\s*\(8u\)|\btt\s*\(8j\)/, jahre: [2008, 2015], varianten: PQ35 },
  { marken: VAG, modell: /golf\s*(v|5)\b|\ba3\s*\(8p\)|octavia\s*(ii|2)\b|leon\s*\(1p\)|touran\s*\(1t\)|\baltea\b/, varianten: PQ35_ALT },
  { marken: VAG, modell: /golf\s*(vi|6)\b/, varianten: PQ35 },
  { marken: VAG, modell: /polo\s*\((6r|6c)\)|fabia\s*(ii|iii|2|3)\b|ibiza\s*\((6j|6p)\)|\brapid\b/, varianten: POLO_6R },
  { marken: VAG, modell: /polo\s*\(aw\)|fabia\s*(iv|4)\b|ibiza\s*\(kj\)|t-cross|\btaigo\b|\barona\b|\ba1\s*\(gb\)/, varianten: POLO_AW },
  { marken: VAG, modell: /\bup!?|citigo|\bmii\b/, varianten: [v('1.0 MPI · 44–55 kW (60–75 PS)', 'CHYA / CHYB', B, Z, 'EA211'), v('1.0 TSI · 66–85 kW (90–115 PS)', 'CHZ', B, Z, 'EA211'), v('e-up! / Citigo e iV', '', E, '', '')] },
  { marken: VAG, modell: /tiguan\s*\(5n\)/, varianten: TIGUAN_5N },
  { marken: VAG, modell: /passat\s*(\/ arteon )?\(b8\)/, varianten: PASSAT_B8 },
  { marken: VAG, modell: /passat\s*\((b6|b7|b6\/b7)\)|\bsuperb\s*(ii|2)\b/, varianten: PASSAT_B6 },
  { marken: VAG, modell: /\ba4\s*\((b8)\)|\ba5\s*\(8t\)|a5 cabriolet\s*\(8f\)|\bq5\s*\(8r\)|\ba6\s*\(c7\)|exeo/, varianten: VAG_B8 },
  { marken: VAG, modell: /\ba4\s*\(b9\)|\ba5\s*\(f5\)|\bq5\s*\(fy\)|\ba6\s*\(c8\)|\ba7\s*\(4k\)/, varianten: VAG_B9 },
  { marken: VAG, modell: /transporter\s*t5|\bt5\b|multivan t5|california t5/, varianten: T5 },
  { marken: VAG, modell: /transporter\s*t6|\bt6(\.1)?\b|multivan t6/, varianten: T6 },
  { marken: VAG, modell: /caddy\s*\(2k\)|\bcaddy\b/, varianten: CADDY_2K },
  { marken: VAG, modell: /\bid\.\s?\d|e-golf|e-tron|enyaq|\bq4\b|\bborn\b/, varianten: [v('Elektro', '', E, '', '')] },
  // BMW / Mini
  { marken: ['mini'], modell: /./, varianten: MINI },
  { marken: ['bmw'], modell: /\be\d{2}\b|3er\s*\(e9\d\)|1er\s*\(e8\d\)|5er\s*\(e6\d\)|\bx3\s*\(e83\)|\bx1\s*\(e84\)/, varianten: BMW_E },
  { marken: ['bmw'], modell: /./, varianten: BMW_N },
  // Mercedes
  { marken: ['mercedes'], modell: /\(w204\)|c-klasse.*204|glk/, varianten: MB_C204 },
  { marken: ['mercedes'], modell: /\(w205\)|\(x253\)|c-klasse.*205|\bglc\b/, varianten: MB_C205 },
  { marken: ['mercedes'], modell: /\(w176\)|\(w246\)|\(c117\)|\(x156\)/, varianten: MB_A176 },
  { marken: ['mercedes'], modell: /\(w177\)|\(w247\)|\(c118\)|\(h247\)/, varianten: MB_A177 },
  { marken: ['mercedes'], modell: /\(w212\)|\(c207\)/, varianten: MB_E212 },
  { marken: ['mercedes'], modell: /\(w213\)|\(c238\)/, varianten: MB_E213 },
  { marken: ['mercedes'], modell: /sprinter|vito|viano|v-klasse/, varianten: MB_VAN },
  // Porsche
  { marken: ['porsche'], modell: /cayenne|macan|panamera/, varianten: PORSCHE_SUV },
  { marken: ['porsche'], modell: /taycan/, varianten: [v('Elektro', '', E, '', '')] },
  // Opel
  { marken: ['opel'], modell: /corsa\s*f|corsa.*\(f\)|mokka\s*(b|ii)\b|astra\s*l\b|crossland|grandland/, varianten: OPEL_PSA },
  { marken: ['opel'], modell: /astra|corsa|zafira|meriva|insignia|mokka|adam|combo|vectra|signum/, varianten: OPEL_F0_F1 },
  // Ford
  { marken: ['ford'], modell: /focus\s*(iv|4|mk ?4)\b/, varianten: FORD_FOCUS4 },
  { marken: ['ford'], modell: /focus|c-max|grand c-max/, varianten: FORD_FOCUS3 },
  { marken: ['ford'], modell: /kuga/, varianten: FORD_KUGA2 },
  { marken: ['ford'], modell: /transit|tourneo/, varianten: FORD_TRANSIT },
  { marken: ['ford'], modell: /mondeo|s-max|galaxy/, varianten: FORD_MONDEO4 },
  { marken: ['ford'], modell: /fiesta|ka\+?|b-max|ecosport|puma/, varianten: FORD_KLEIN },
  // Renault / Dacia
  { marken: ['renault', 'dacia'], modell: /zoe|kangoo z\.e|twizy|megane e-tech/, varianten: [v('Elektro', '', E, '', '')] },
  { marken: ['renault', 'dacia'], modell: /./, varianten: RENAULT },
  // Peugeot / Citroën / DS
  { marken: STELLANTIS, modell: /e-208|e-2008|ë-c4|e-c4|e-berlingo/, varianten: [v('Elektro', '', E, '', '')] },
  { marken: STELLANTIS, modell: /./, varianten: PSA },
  // Toyota / Lexus
  { marken: ['toyota'], modell: /yaris.*(xp21|iv|4)\b|yaris cross/, varianten: TOYOTA_YARIS4 },
  { marken: ['toyota'], modell: /yaris/, varianten: TOYOTA_YARIS3 },
  { marken: ['toyota'], modell: /aygo/, varianten: [v('1.0 VVT-i · 51–53 kW (69–72 PS)', '1KR-FE', B, K, '')] },
  { marken: ['toyota'], modell: /auris/, varianten: TOYOTA_AURIS },
  { marken: ['toyota'], modell: /corolla/, varianten: TOYOTA_COROLLA12 },
  { marken: ['toyota'], modell: /rav ?4/, varianten: TOYOTA_RAV4 },
  { marken: ['toyota'], modell: /c-hr/, varianten: TOYOTA_CHR },
  { marken: ['toyota'], modell: /hilux/, varianten: TOYOTA_HILUX },
  { marken: ['toyota'], modell: /prius/, varianten: TOYOTA_PRIUS },
  // Honda
  { marken: ['honda'], modell: /civic\s*\(fl\)/, varianten: [v('1.5 VTEC Turbo', 'L15', B, K, ''), v('2.0 e:HEV Hybrid · 135 kW (184 PS)', 'LFC', H, K, '', 'cvt')] },
  { marken: ['honda'], modell: /civic/, jahre: [2006, 2011], varianten: HONDA_CIVIC8 },
  { marken: ['honda'], modell: /civic/, jahre: [2012, 2016], varianten: HONDA_CIVIC9 },
  { marken: ['honda'], modell: /civic/, jahre: [2017, 2022], varianten: HONDA_CIVIC10 },
  { marken: ['honda'], modell: /jazz/, varianten: HONDA_JAZZ },
  { marken: ['honda'], modell: /cr-?v/, varianten: HONDA_CRV },
  { marken: ['honda'], modell: /hr-?v/, varianten: HONDA_HRV },
  { marken: ['honda'], modell: /accord/, varianten: HONDA_ACCORD },
  // Mazda
  { marken: ['mazda'], modell: /\((bm|bp|gj|dj|dk|dm|kf|nd)\)|\(ke\)|cx-3|cx-30|skyactiv/, varianten: MAZDA_SKY },
  { marken: ['mazda'], modell: /\((bk|bl|gg|gh|dy|de|nc|cr|cw)\)|mzr/, varianten: MAZDA_MZR },
  { marken: ['mazda'], modell: /./, jahre: [2013, 2099], varianten: MAZDA_SKY },
  { marken: ['mazda'], modell: /./, jahre: [2002, 2012], varianten: MAZDA_MZR },
  // Nissan
  { marken: ['nissan'], modell: /leaf/, varianten: [v('Elektro', '', E, '', '')] },
  { marken: ['nissan'], modell: /qashqai|juke|note|pulsar/, varianten: NISSAN_ALLIANZ },
  { marken: ['nissan'], modell: /micra/, varianten: NISSAN_KLEIN },
  { marken: ['nissan'], modell: /x-?trail/, varianten: NISSAN_XTRAIL },
  { marken: ['nissan'], modell: /navara/, varianten: NISSAN_NAVARA },
  // Hyundai / Kia
  { marken: ['hyundai', 'kia'], modell: /kona electric|ioniq\s?[56]|\bev6\b|e-niro|e-soul|ioniq electric/, varianten: [v('Elektro', '', E, '', '')] },
  { marken: ['hyundai', 'kia'], modell: /tucson|ix35|sportage|santa fe|sorento/, varianten: HK_SUV },
  { marken: ['hyundai', 'kia'], modell: /i10|i20|i30|ceed|cee'd|rio|picanto|stonic|kona|niro|venga|ix20|bayon|xceed|ioniq/, jahre: [2012, 2099], varianten: HK_NEU },
  { marken: ['hyundai', 'kia'], modell: /i10|i20|i30|ceed|cee'd|rio|picanto|venga|ix20|getz|matrix/, jahre: [2000, 2011], varianten: HK_ALT },
  { marken: ['hyundai', 'kia'], modell: /./, varianten: HK_NEU },
  // Volvo
  { marken: ['volvo'], modell: /xc40|c40/, varianten: VOLVO_XC40 },
  { marken: ['volvo'], modell: /xc90\s*\(ii\)|xc60\s*\(ii\)|v60\s*\(ii\)|s60\s*\(iii\)|\bs90\b|\bv90\b/, varianten: VOLVO_SPA },
  { marken: ['volvo'], modell: /./, varianten: VOLVO_P3 },
  // Fiat / Alfa Romeo
  { marken: ['fiat'], modell: /ducato/, varianten: FIAT_DUCATO },
  { marken: ['fiat'], modell: /\b500\b(?!x|l)|panda|punto|\bqubo\b|fiorino/, varianten: FIAT_KLEIN },
  { marken: ['fiat'], modell: /./, varianten: FIAT_MITTEL },
  { marken: ['alfa romeo', 'alfa'], modell: /./, varianten: ALFA },
];

const MARKE_ALIAS: Record<string, string> = {
  volkswagen: 'vw', 'mercedes-benz': 'mercedes', mb: 'mercedes', 'škoda': 'skoda', 'citroën': 'citroen', alfa: 'alfa romeo',
};

/** Factory engine variants for Marke / Modell (and Baujahr, where generations share a name). */
export function motorVarianten(marke?: string, modell?: string, baujahr?: number): VinVariante[] {
  const m = (marke ?? '').trim().toLowerCase();
  const mk = MARKE_ALIAS[m] ?? m;
  const text = (modell ?? '').trim().toLowerCase();
  if (!mk || !text) return [];
  const treffer = KATALOG.filter((x) => x.marken.includes(mk) && x.modell.test(text)
    && (!x.jahre || baujahr == null || (baujahr >= x.jahre[0] && baujahr <= x.jahre[1])));
  // Without a year, entries for different periods can't be told apart: offer none of them.
  if (baujahr == null && treffer.length > 1 && treffer.some((x) => x.jahre)) return [];
  const e = treffer[0];
  if (!e) return [];
  // Electric models need no pick: their single entry is applied as such by the caller.
  return e.varianten;
}
