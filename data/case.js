// 由 scripts/build-data.mjs 自動產生，請勿手動編輯。
window.CASE_DATA = {
 "assets": [
  {
   "asset_id": "A01",
   "name": "vpn-gw-01",
   "type": "VPN Gateway",
   "environment": "DMZ",
   "owner": "Network Team",
   "business_criticality": 4,
   "data_classification": "Internal",
   "internet_exposed": true,
   "os_or_platform": "Synthetic VPN Appliance 9.2",
   "notes": "員工遠端存取入口"
  },
  {
   "asset_id": "A02",
   "name": "web-portal-01",
   "type": "Customer Web Portal",
   "environment": "DMZ",
   "owner": "Digital Team",
   "business_criticality": 4,
   "data_classification": "Confidential",
   "internet_exposed": true,
   "os_or_platform": "Ubuntu 22.04 / Nginx / SynthCMS 3.1",
   "notes": "客戶訂單查詢入口"
  },
  {
   "asset_id": "A03",
   "name": "mail-gw-01",
   "type": "Mail Gateway",
   "environment": "DMZ",
   "owner": "IT Ops",
   "business_criticality": 3,
   "data_classification": "Internal",
   "internet_exposed": true,
   "os_or_platform": "Synthetic Mail Gateway 7",
   "notes": "SMTP/IMAP 對外"
  },
  {
   "asset_id": "A04",
   "name": "ad-dc-01",
   "type": "Active Directory Domain Controller",
   "environment": "Core",
   "owner": "IT Ops",
   "business_criticality": 5,
   "data_classification": "Restricted",
   "internet_exposed": false,
   "os_or_platform": "Windows Server 2019",
   "notes": "主網域控制站"
  },
  {
   "asset_id": "A05",
   "name": "erp-app-01",
   "type": "ERP Application Server",
   "environment": "Core",
   "owner": "ERP Team",
   "business_criticality": 5,
   "data_classification": "Restricted",
   "internet_exposed": false,
   "os_or_platform": "Windows Server 2022 / SynthERP 12",
   "notes": "訂單、財務、BOM"
  },
  {
   "asset_id": "A06",
   "name": "erp-db-01",
   "type": "ERP Database",
   "environment": "Core",
   "owner": "DBA Team",
   "business_criticality": 5,
   "data_classification": "Restricted",
   "internet_exposed": false,
   "os_or_platform": "RHEL 9 / PostgreSQL 15",
   "notes": "ERP 核心資料庫（crown jewel）"
  },
  {
   "asset_id": "A07",
   "name": "mes-srv-01",
   "type": "Manufacturing Execution System",
   "environment": "OT-DMZ",
   "owner": "Plant IT",
   "business_criticality": 5,
   "data_classification": "Restricted",
   "internet_exposed": false,
   "os_or_platform": "Windows Server 2016 / SynthMES 5",
   "notes": "連接產線 PLC"
  },
  {
   "asset_id": "A08",
   "name": "file-srv-01",
   "type": "File Server",
   "environment": "Core",
   "owner": "IT Ops",
   "business_criticality": 3,
   "data_classification": "Confidential",
   "internet_exposed": false,
   "os_or_platform": "Windows Server 2019",
   "notes": "設計圖與合約"
  },
  {
   "asset_id": "A09",
   "name": "jump-host-01",
   "type": "Admin Jump Host",
   "environment": "Core",
   "owner": "IT Ops",
   "business_criticality": 4,
   "data_classification": "Internal",
   "internet_exposed": false,
   "os_or_platform": "Windows Server 2022",
   "notes": "管理員跳板機"
  },
  {
   "asset_id": "A10",
   "name": "s3-backup-bucket",
   "type": "Cloud Object Storage (Backup)",
   "environment": "Cloud",
   "owner": "IT Ops",
   "business_criticality": 4,
   "data_classification": "Restricted",
   "internet_exposed": true,
   "os_or_platform": "SynthCloud Object Storage",
   "notes": "每日備份"
  },
  {
   "asset_id": "A11",
   "name": "ci-runner-01",
   "type": "CI/CD Runner",
   "environment": "Cloud",
   "owner": "Platform Team",
   "business_criticality": 3,
   "data_classification": "Internal",
   "internet_exposed": true,
   "os_or_platform": "Ubuntu 24.04 / SynthCI Runner",
   "notes": "建置與部署管線"
  },
  {
   "asset_id": "A12",
   "name": "hr-saas-sso",
   "type": "HR SaaS (SSO-integrated)",
   "environment": "SaaS",
   "owner": "HR",
   "business_criticality": 3,
   "data_classification": "Confidential",
   "internet_exposed": true,
   "os_or_platform": "Synthetic HR SaaS",
   "notes": "透過 SSO 整合"
  }
 ],
 "vulnerabilities": [
  {
   "finding_id": "F001",
   "asset_id": "A01",
   "vuln_id": "SYN-2026-0101",
   "title": "VPN appliance pre-auth RCE (synthetic)",
   "cvss_base": 9.8,
   "exploit_public": true,
   "epss_sim": 0.91,
   "kev_sim": true,
   "first_seen": "2026-08-20",
   "patch_available": true,
   "notes": "廠商已釋出修補；模擬「近期被大量利用」情境"
  },
  {
   "finding_id": "F002",
   "asset_id": "A01",
   "vuln_id": "SYN-2025-0342",
   "title": "VPN admin panel weak session handling (synthetic)",
   "cvss_base": 6.5,
   "exploit_public": false,
   "epss_sim": 0.08,
   "kev_sim": false,
   "first_seen": "2026-05-11",
   "patch_available": true,
   "notes": ""
  },
  {
   "finding_id": "F003",
   "asset_id": "A02",
   "vuln_id": "SYN-2026-0210",
   "title": "SynthCMS file upload leads to RCE (synthetic)",
   "cvss_base": 8.8,
   "exploit_public": true,
   "epss_sim": 0.62,
   "kev_sim": false,
   "first_seen": "2026-08-28",
   "patch_available": true,
   "notes": ""
  },
  {
   "finding_id": "F004",
   "asset_id": "A02",
   "vuln_id": "SYN-2025-0977",
   "title": "Nginx outdated version (synthetic)",
   "cvss_base": 5.3,
   "exploit_public": false,
   "epss_sim": 0.03,
   "kev_sim": false,
   "first_seen": "2026-03-02",
   "patch_available": true,
   "notes": ""
  },
  {
   "finding_id": "F005",
   "asset_id": "A03",
   "vuln_id": "SYN-2026-0150",
   "title": "Mail gateway auth bypass (synthetic)",
   "cvss_base": 9.1,
   "exploit_public": true,
   "epss_sim": 0.45,
   "kev_sim": false,
   "first_seen": "2026-07-30",
   "patch_available": false,
   "notes": "尚無修補，僅有緩解建議"
  },
  {
   "finding_id": "F006",
   "asset_id": "A04",
   "vuln_id": "SYN-2025-0500",
   "title": "Kerberos ticket handling weakness (synthetic)",
   "cvss_base": 8.1,
   "exploit_public": true,
   "epss_sim": 0.3,
   "kev_sim": false,
   "first_seen": "2026-01-15",
   "patch_available": true,
   "notes": "需重開機，維護窗口受限"
  },
  {
   "finding_id": "F007",
   "asset_id": "A05",
   "vuln_id": "SYN-2026-0333",
   "title": "SynthERP deserialization RCE (synthetic)",
   "cvss_base": 9,
   "exploit_public": false,
   "epss_sim": 0.12,
   "kev_sim": false,
   "first_seen": "2026-08-05",
   "patch_available": true,
   "notes": ""
  },
  {
   "finding_id": "F008",
   "asset_id": "A06",
   "vuln_id": "SYN-2024-0810",
   "title": "PostgreSQL privilege escalation (synthetic)",
   "cvss_base": 7.8,
   "exploit_public": true,
   "epss_sim": 0.2,
   "kev_sim": false,
   "first_seen": "2025-11-20",
   "patch_available": true,
   "notes": ""
  },
  {
   "finding_id": "F009",
   "asset_id": "A07",
   "vuln_id": "SYN-2023-0044",
   "title": "SynthMES unauthenticated API (synthetic)",
   "cvss_base": 9.4,
   "exploit_public": true,
   "epss_sim": 0.55,
   "kev_sim": false,
   "first_seen": "2025-06-01",
   "patch_available": false,
   "notes": "OT 廠商不支援升級；需補償控制"
  },
  {
   "finding_id": "F010",
   "asset_id": "A08",
   "vuln_id": "SYN-2025-0620",
   "title": "SMB signing not enforced (synthetic)",
   "cvss_base": 5.9,
   "exploit_public": true,
   "epss_sim": 0.1,
   "kev_sim": false,
   "first_seen": "2026-02-10",
   "patch_available": true,
   "notes": ""
  },
  {
   "finding_id": "F011",
   "asset_id": "A09",
   "vuln_id": "SYN-2026-0015",
   "title": "RDP exposed to user VLAN without MFA (synthetic)",
   "cvss_base": 7.5,
   "exploit_public": false,
   "epss_sim": 0.05,
   "kev_sim": false,
   "first_seen": "2026-06-18",
   "patch_available": true,
   "notes": "設定議題，非軟體漏洞"
  },
  {
   "finding_id": "F012",
   "asset_id": "A10",
   "vuln_id": "SYN-2026-0402",
   "title": "Object storage bucket policy allows anonymous list (synthetic)",
   "cvss_base": 7.5,
   "exploit_public": false,
   "epss_sim": 0.3,
   "kev_sim": false,
   "first_seen": "2026-09-01",
   "patch_available": true,
   "notes": "設定議題"
  },
  {
   "finding_id": "F013",
   "asset_id": "A11",
   "vuln_id": "SYN-2026-0388",
   "title": "CI runner exposes token in build logs (synthetic)",
   "cvss_base": 8.2,
   "exploit_public": false,
   "epss_sim": 0.15,
   "kev_sim": false,
   "first_seen": "2026-08-25",
   "patch_available": true,
   "notes": ""
  },
  {
   "finding_id": "F014",
   "asset_id": "A12",
   "vuln_id": "SYN-2026-0290",
   "title": "SSO app lacks MFA enforcement for admins (synthetic)",
   "cvss_base": 7.2,
   "exploit_public": false,
   "epss_sim": 0.06,
   "kev_sim": false,
   "first_seen": "2026-07-12",
   "patch_available": true,
   "notes": "設定議題"
  }
 ],
 "identities": [
  {
   "identity_id": "I01",
   "account": "svc-erp-sync",
   "type": "service",
   "privilege_level": "domain_admin",
   "mfa_enabled": false,
   "last_login_days": 1,
   "linked_assets": "A04;A05;A06",
   "notes": "ERP 同步服務帳號具網域管理員權限（過度授權）"
  },
  {
   "identity_id": "I02",
   "account": "adm-jsmith",
   "type": "human",
   "privilege_level": "domain_admin",
   "mfa_enabled": true,
   "last_login_days": 2,
   "linked_assets": "A04;A09",
   "notes": ""
  },
  {
   "identity_id": "I03",
   "account": "adm-legacy01",
   "type": "human",
   "privilege_level": "domain_admin",
   "mfa_enabled": false,
   "last_login_days": 190,
   "linked_assets": "A04",
   "notes": "190 天未登入的管理員帳號"
  },
  {
   "identity_id": "I04",
   "account": "svc-backup",
   "type": "service",
   "privilege_level": "local_admin",
   "mfa_enabled": false,
   "last_login_days": 1,
   "linked_assets": "A06;A08;A10",
   "notes": "備份服務帳號可寫入備份儲存桶"
  },
  {
   "identity_id": "I05",
   "account": "ci-deploy-bot",
   "type": "service",
   "privilege_level": "deploy",
   "mfa_enabled": false,
   "last_login_days": 1,
   "linked_assets": "A11;A02",
   "notes": "CI 部署帳號持有 web-portal 部署金鑰"
  },
  {
   "identity_id": "I06",
   "account": "vpn-user-group",
   "type": "group",
   "privilege_level": "user",
   "mfa_enabled": "partial",
   "last_login_days": 0,
   "linked_assets": "A01",
   "notes": "VPN 群組中 12% 使用者未啟用 MFA"
  },
  {
   "identity_id": "I07",
   "account": "mes-operator",
   "type": "human",
   "privilege_level": "local_admin",
   "mfa_enabled": false,
   "last_login_days": 1,
   "linked_assets": "A07",
   "notes": "產線操作員共用帳號"
  },
  {
   "identity_id": "I08",
   "account": "hr-admin-role",
   "type": "role",
   "privilege_level": "app_admin",
   "mfa_enabled": false,
   "last_login_days": 3,
   "linked_assets": "A12",
   "notes": "HR SaaS 管理角色未強制 MFA"
  }
 ],
 "misconfigurations": [
  {
   "config_id": "C01",
   "asset_id": "A01",
   "benchmark": "Vendor hardening guide",
   "control": "Disable legacy TLS 1.0/1.1",
   "status": "fail",
   "severity": "medium",
   "notes": ""
  },
  {
   "config_id": "C02",
   "asset_id": "A02",
   "benchmark": "CIS Ubuntu 22.04",
   "control": "Web server runs as root",
   "status": "fail",
   "severity": "high",
   "notes": ""
  },
  {
   "config_id": "C03",
   "asset_id": "A04",
   "benchmark": "CIS Windows Server 2019",
   "control": "Enforce SMB signing",
   "status": "fail",
   "severity": "medium",
   "notes": ""
  },
  {
   "config_id": "C04",
   "asset_id": "A06",
   "benchmark": "CIS PostgreSQL",
   "control": "pg_hba trust auth from app subnet",
   "status": "fail",
   "severity": "high",
   "notes": ""
  },
  {
   "config_id": "C05",
   "asset_id": "A07",
   "benchmark": "IEC 62443 zone/conduit",
   "control": "OT-DMZ to plant network unrestricted",
   "status": "fail",
   "severity": "high",
   "notes": ""
  },
  {
   "config_id": "C06",
   "asset_id": "A09",
   "benchmark": "CIS Windows Server 2022",
   "control": "RDP NLA enforced",
   "status": "pass",
   "severity": "low",
   "notes": ""
  },
  {
   "config_id": "C07",
   "asset_id": "A10",
   "benchmark": "Cloud storage baseline",
   "control": "Block public access",
   "status": "fail",
   "severity": "high",
   "notes": ""
  },
  {
   "config_id": "C08",
   "asset_id": "A11",
   "benchmark": "CI baseline",
   "control": "Secrets masked in logs",
   "status": "fail",
   "severity": "high",
   "notes": ""
  },
  {
   "config_id": "C09",
   "asset_id": "A12",
   "benchmark": "SaaS baseline",
   "control": "Admin roles require phishing-resistant MFA",
   "status": "fail",
   "severity": "medium",
   "notes": ""
  }
 ],
 "controls": {
  "_note": "合成資料。描述既有控制措施的覆蓋範圍，供分析時評估『既有控制是否已降低曝險』。",
  "as_of": "2026-09-01",
  "controls": [
   {
    "control_id": "K01",
    "name": "EDR",
    "coverage_assets": [
     "A02",
     "A04",
     "A05",
     "A08",
     "A09"
    ],
    "gaps": [
     "A01",
     "A03",
     "A06",
     "A07",
     "A11"
    ],
    "maturity": "managed",
    "notes": "VPN/郵件閘道與 OT 主機無 EDR"
   },
   {
    "control_id": "K02",
    "name": "WAF",
    "coverage_assets": [
     "A02"
    ],
    "gaps": [],
    "maturity": "basic",
    "notes": "僅偵測模式，未啟用阻擋"
   },
   {
    "control_id": "K03",
    "name": "Network segmentation",
    "coverage_assets": [
     "A06"
    ],
    "gaps": [
     "A07"
    ],
    "maturity": "partial",
    "notes": "ERP DB 已隔離；OT-DMZ 與產線網段未隔離"
   },
   {
    "control_id": "K04",
    "name": "MFA",
    "coverage_assets": [
     "A09",
     "A12"
    ],
    "gaps": [
     "A01",
     "A07"
    ],
    "maturity": "partial",
    "notes": "VPN 群組 12% 未啟用；OT 共用帳號無 MFA"
   },
   {
    "control_id": "K05",
    "name": "Immutable backups",
    "coverage_assets": [],
    "gaps": [
     "A10"
    ],
    "maturity": "none",
    "notes": "備份儲存桶未啟用物件鎖定／版本控管"
   },
   {
    "control_id": "K06",
    "name": "Central logging / SIEM",
    "coverage_assets": [
     "A01",
     "A02",
     "A04",
     "A05",
     "A09"
    ],
    "gaps": [
     "A03",
     "A06",
     "A07",
     "A10",
     "A11"
    ],
    "maturity": "managed",
    "notes": ""
   },
   {
    "control_id": "K07",
    "name": "Deception (honey accounts/tokens)",
    "coverage_assets": [],
    "gaps": [
     "A04",
     "A06",
     "A08"
    ],
    "maturity": "none",
    "notes": "尚未部署"
   },
   {
    "control_id": "K08",
    "name": "Patch SLA",
    "coverage_assets": [
     "A02",
     "A04",
     "A05",
     "A08",
     "A09",
     "A11"
    ],
    "gaps": [
     "A01",
     "A03",
     "A07"
    ],
    "maturity": "partial",
    "notes": "網路設備與 OT 由不同團隊負責，無 SLA"
   }
  ]
 },
 "threatIntel": {
  "_note": "合成威脅情資。行為者名稱、活動與弱點編號皆為虛構，用於示範『情資如何影響優先序』。",
  "as_of": "2026-09-05",
  "sector": "Discrete manufacturing (Taiwan / APAC)",
  "actors": [
   {
    "actor_id": "T01",
    "name": "SYNTHETIC-GROUP-ALPHA",
    "motivation": "ransomware / extortion",
    "targets_sector": true,
    "confidence": "medium",
    "ttps": [
     "initial-access:exploit-public-facing-vpn",
     "credential-access:kerberoasting",
     "lateral:smb-relay",
     "impact:encrypt-and-delete-backups"
    ],
    "exploits_vuln_ids": [
     "SYN-2026-0101",
     "SYN-2025-0500"
    ],
    "recent_activity": "2026-08 起針對 APAC 製造業 VPN 設備進行大規模掃描與利用（合成）"
   },
   {
    "actor_id": "T02",
    "name": "SYNTHETIC-GROUP-BETA",
    "motivation": "espionage / IP theft",
    "targets_sector": true,
    "confidence": "low",
    "ttps": [
     "initial-access:phishing-via-mail-gateway",
     "persistence:oauth-app-consent",
     "collection:file-share-crawl"
    ],
    "exploits_vuln_ids": [
     "SYN-2026-0150"
    ],
    "recent_activity": "針對設計圖與供應鏈合約（合成）"
   },
   {
    "actor_id": "T03",
    "name": "SYNTHETIC-OT-CAMPAIGN",
    "motivation": "disruption",
    "targets_sector": true,
    "confidence": "low",
    "ttps": [
     "initial-access:it-to-ot-pivot",
     "impact:mes-manipulation"
    ],
    "exploits_vuln_ids": [
     "SYN-2023-0044"
    ],
    "recent_activity": "公開報告提及 MES API 濫用（合成）"
   }
  ],
  "trending_weakness_classes": [
   "edge-device-rce",
   "identity-mfa-gaps",
   "backup-tampering",
   "ci-secrets-leak"
  ]
 },
 "topology": {
  "_note": "合成網路可達性與信任關係。edge 表示『若攻擊者控制 from，可嘗試觸及 to』，供攻擊路徑假設使用；並非實際驗證結果。",
  "crown_jewels": [
   "A06",
   "A07"
  ],
  "edges": [
   {
    "from": "internet",
    "to": "A01",
    "via": "VPN 443/tcp",
    "trust": "exposed"
   },
   {
    "from": "internet",
    "to": "A02",
    "via": "HTTPS 443/tcp",
    "trust": "exposed"
   },
   {
    "from": "internet",
    "to": "A03",
    "via": "SMTP/IMAP",
    "trust": "exposed"
   },
   {
    "from": "internet",
    "to": "A10",
    "via": "Object storage API",
    "trust": "exposed"
   },
   {
    "from": "internet",
    "to": "A11",
    "via": "CI webhook",
    "trust": "exposed"
   },
   {
    "from": "internet",
    "to": "A12",
    "via": "SaaS login",
    "trust": "exposed"
   },
   {
    "from": "A01",
    "to": "A04",
    "via": "VPN 使用者網段可達 DC (LDAP/Kerberos/SMB)",
    "trust": "network"
   },
   {
    "from": "A01",
    "to": "A09",
    "via": "RDP 3389 無 MFA",
    "trust": "network"
   },
   {
    "from": "A02",
    "to": "A05",
    "via": "應用 API 8443",
    "trust": "app-trust"
   },
   {
    "from": "A03",
    "to": "A08",
    "via": "釣魚後使用者工作站 → SMB",
    "trust": "user-pivot"
   },
   {
    "from": "A04",
    "to": "A05",
    "via": "網域信任 / svc-erp-sync 網域管理員",
    "trust": "identity"
   },
   {
    "from": "A04",
    "to": "A06",
    "via": "svc-erp-sync 憑證",
    "trust": "identity"
   },
   {
    "from": "A04",
    "to": "A08",
    "via": "網域管理員",
    "trust": "identity"
   },
   {
    "from": "A05",
    "to": "A06",
    "via": "pg_hba trust 認證",
    "trust": "misconfig"
   },
   {
    "from": "A08",
    "to": "A07",
    "via": "OT-DMZ 未隔離 / SMB",
    "trust": "network"
   },
   {
    "from": "A09",
    "to": "A07",
    "via": "跳板機可達 OT-DMZ",
    "trust": "network"
   },
   {
    "from": "A09",
    "to": "A06",
    "via": "DBA 由跳板機管理",
    "trust": "network"
   },
   {
    "from": "A11",
    "to": "A02",
    "via": "ci-deploy-bot 部署金鑰",
    "trust": "identity"
   },
   {
    "from": "A10",
    "to": "A06",
    "via": "備份內含 DB dump（資料外洩路徑）",
    "trust": "data"
   }
  ]
 },
 "exposures": {
  "_note": "合成 EASM（外部攻擊面管理）輸出。IP 使用文件保留位址（TEST-NET）。",
  "as_of": "2026-09-03",
  "exposures": [
   {
    "asset_id": "A01",
    "hostname": "vpn.northwind-synthetic.example",
    "ip": "203.0.113.10",
    "ports": [
     443
    ],
    "fingerprint": "Synthetic VPN Appliance 9.2",
    "tls_expiry": "2026-11-30",
    "issues": [
     "outdated-firmware",
     "legacy-tls"
    ]
   },
   {
    "asset_id": "A02",
    "hostname": "portal.northwind-synthetic.example",
    "ip": "203.0.113.20",
    "ports": [
     80,
     443
    ],
    "fingerprint": "nginx/1.18 SynthCMS 3.1",
    "tls_expiry": "2026-10-15",
    "issues": [
     "outdated-cms",
     "http-redirect-missing"
    ]
   },
   {
    "asset_id": "A03",
    "hostname": "mail.northwind-synthetic.example",
    "ip": "203.0.113.30",
    "ports": [
     25,
     587,
     993
    ],
    "fingerprint": "Synthetic Mail Gateway 7",
    "tls_expiry": "2027-01-10",
    "issues": [
     "auth-bypass-advisory"
    ]
   },
   {
    "asset_id": "A10",
    "hostname": "backup-nw-synth.objects.example",
    "ip": null,
    "ports": [
     443
    ],
    "fingerprint": "SynthCloud Object Storage",
    "tls_expiry": null,
    "issues": [
     "anonymous-list"
    ]
   },
   {
    "asset_id": "A11",
    "hostname": "ci.northwind-synthetic.example",
    "ip": "203.0.113.40",
    "ports": [
     443
    ],
    "fingerprint": "SynthCI Runner",
    "tls_expiry": "2026-12-01",
    "issues": []
   },
   {
    "asset_id": "A12",
    "hostname": "hr.synthetic-saas.example",
    "ip": null,
    "ports": [
     443
    ],
    "fingerprint": "Synthetic HR SaaS",
    "tls_expiry": null,
    "issues": [
     "admin-mfa-not-enforced"
    ]
   },
   {
    "asset_id": null,
    "hostname": "old-test.northwind-synthetic.example",
    "ip": "203.0.113.50",
    "ports": [
     8080
    ],
    "fingerprint": "Unknown / Tomcat-like banner",
    "tls_expiry": null,
    "issues": [
     "unknown-asset",
     "not-in-inventory"
    ]
   }
  ]
 },
 "scope": {
  "_note": "合成分析範圍設定。所有分析必須在此授權範圍內進行；任何主動測試須另行核准。",
  "organization": "Northwind Precision（虛構）",
  "analysis_date": "2026-09-08",
  "authorized_scope": {
   "in_scope_assets": [
    "A01",
    "A02",
    "A03",
    "A04",
    "A05",
    "A06",
    "A07",
    "A08",
    "A09",
    "A10",
    "A11",
    "A12"
   ],
   "excluded": [
    "產線 PLC 與 HMI（僅可讀取 MES 相關資料，不得對 OT 提出主動測試）"
   ],
   "active_testing_authorized": false,
   "external_scanning_authorized": false,
   "authorizer": "CISO（合成）",
   "authorization_reference": "SYN-AUTH-2026-09"
  },
  "risk_appetite": {
   "max_tolerable_outage_hours": {
    "A06": 4,
    "A07": 2,
    "A05": 8
   },
   "regulatory_context": [
    "合成：個資法",
    "合成：客戶合約資安條款"
   ]
  },
  "reporting": {
   "audience": [
    "CISO",
    "IT 主管",
    "廠務主管"
   ],
   "language": "zh-TW",
   "cadence": "weekly"
  }
 },
 "expectedOutput": "# 預期輸出（合成資料 Northwind Precision）\n\n> 本檔為以 `examples/synthetic-org/` 執行「先制型曝險分析」時的**參考輸出**。數值由確定性示範引擎（`node scripts/run-demo.mjs`）產生；語言模型執行各平台 skill 時，**分級（P1–P4）、主要依據與路徑存在性應一致，小數可不同**。所有資料皆為合成；評分規則為本專案示範規則，非 Gartner 公式。\n\n## 資料品質\n\n| 檔案 | 筆數 | 異常 |\n|---|---|---|\n| scope.json | 1 | 主動測試授權 = false；外部掃描授權 = false |\n| assets.csv | 12 | 無 |\n| vulnerabilities.csv | 14 | 無 |\n| exposures.json | 7 | `old-test.northwind-synthetic.example`（asset_id null）未納入清冊 |\n| identities.csv | 8 | 無 |\n| misconfigurations.csv | 9 | 無 |\n| controls.json | 8 | 無 |\n| threat-intel.json | 3 行為者 | 無 |\n| topology.json | 19 邊 | 無 |\n\n信心：高（無缺漏類別）。\n\n## 曝險優先序（平衡胃納：P1 ≥ 60、P2 ≥ 40、P3 ≥ 20）\n\n| 優先 | 資產 | 發現 | 分數 | 可能性 | 影響 | 主要依據 |\n|---|---|---|---|---|---|---|\n| P1 | vpn-gw-01 | SYN-2026-0101 | 86.0 | 10.0 | 8.6 | 對外曝露；EASM 議題；公開利用程式；EPSS 0.91；KEV；身分弱點；設定偏差；控制缺口 EDR/MFA/Patch SLA；情資 ALPHA（medium）；可達 crown jewel 之入口 |\n| P1 | mes-srv-01 | SYN-2023-0044 | 72.5 | 7.3 | 10.0 | 公開利用程式；EPSS 0.55；身分弱點；設定偏差；控制缺口 ×5；情資 OT（low）；crown jewel |\n| P1 | web-portal-01 | SYN-2026-0210 | 68.7 | 7.2 | 9.6 | 對外曝露；EASM 議題；公開利用程式；EPSS 0.62；設定偏差；既有控制 EDR/WAF/SIEM/SLA；入口 |\n| P1 | s3-backup-bucket | SYN-2026-0402 | 64.4 | 6.4 | 10.0 | 對外曝露；匿名列出；身分弱點；設定偏差；控制缺口 不可變備份/SIEM；入口 |\n| P1 | mail-gw-01 | SYN-2026-0150 | 63.4 | 8.8 | 7.2 | 對外曝露；EASM 議題；公開利用程式；控制缺口 EDR/SIEM/SLA；情資 BETA（low）；入口 |\n| P2 | ad-dc-01 | SYN-2025-0500 | 54.8 | 5.5 | 10.0 | 公開利用程式；身分弱點 ×2；設定偏差；既有控制；無欺敵；情資 ALPHA（medium） |\n| P2 | erp-db-01 | SYN-2024-0810 | 52.8 | 5.3 | 10.0 | 公開利用程式；身分弱點 ×2；設定偏差；網段隔離；控制缺口；crown jewel |\n| P2 | vpn-gw-01 | SYN-2025-0342 | 48.3 | 5.6 | 8.6 | 對外曝露；EASM 議題；身分弱點；設定偏差；控制缺口；入口 |\n| P3 | ci-runner-01 | SYN-2026-0388 | 36.1 | 5.0 | 7.2 | 對外曝露；身分弱點；設定偏差；控制缺口；入口 |\n| P3 | web-portal-01 | SYN-2025-0977 | 32.5 | 3.4 | 9.6 | 對外曝露；EASM 議題；既有控制；入口 |\n| P3 | hr-saas-sso | SYN-2026-0290 | 28.5 | 4.6 | 6.2 | 對外曝露；EASM 議題；身分弱點；設定偏差；MFA |\n| P4 | file-srv-01 | SYN-2025-0620 | 15.3 | 2.5 | 6.2 | 公開利用程式；身分弱點；既有控制 |\n| P4 | erp-app-01 | SYN-2026-0333 | 0.0 | 0.0 | 10.0 | 既有控制 EDR/SIEM/SLA |\n| P4 | jump-host-01 | SYN-2026-0015 | 0.0 | 0.0 | 6.6 | 既有控制 EDR/MFA/SIEM/SLA |\n\n## 攻擊路徑假設（status: hypothesis）\n\n| # | 路徑 | 跳數 | 可行性 |\n|---|---|---|---|\n| H1 | internet → vpn-gw-01 → ad-dc-01 → erp-db-01 | 3 | 6.4 |\n| H2 | internet → vpn-gw-01 → ad-dc-01 → erp-app-01 → erp-db-01 | 4 | 5.2 |\n| H3 | internet → vpn-gw-01 → ad-dc-01 → file-srv-01 → mes-srv-01 | 4 | 4.9 |\n| H4 | internet → s3-backup-bucket → erp-db-01 | 2 | 4.2 |\n| H5 | internet → mail-gw-01 → file-srv-01 → mes-srv-01 | 3 | 3.9 |\n| H6 | internet → vpn-gw-01 → jump-host-01 → mes-srv-01 | 3 | 3.8 |\n| H7 | internet → vpn-gw-01 → jump-host-01 → erp-db-01 | 3 | 3.8 |\n| H8 | internet → web-portal-01 → erp-app-01 → erp-db-01 | 3 | 3.4 |\n| H9 | internet → ci-runner-01 → web-portal-01 → erp-app-01 → erp-db-01 | 4 | 2.7 |\n\n節點可能性：有發現者取其最高可能性（可為 0）；無任何發現的節點取 3（未知）。\n\n## 安全驗證計畫（提案；兩個授權旗標皆 false）\n\n| # | 假設 | 方法 | 授權狀態 |\n|---|---|---|---|\n| V1 | H1：vpn-gw-01 → erp-db-01（3 跳） | 授權下的外部驗證（版本確認／安全 PoC）+ 內部 BAS 模擬橫向移動 | 尚未授權主動測試：需 CISO 另行核准（含外部掃描授權）並排除 OT |\n| V2 | H2：vpn-gw-01 → erp-db-01（4 跳） | 同上 | 同上 |\n| V3 | H3：vpn-gw-01 → mes-srv-01（4 跳） | 同上（OT 端點只做讀取式驗證） | 同上 |\n\n授權狀態規則：`active_testing_authorized` 或 `external_scanning_authorized` 任一為 false → 「尚未授權主動測試」；入口對外的驗證需兩者皆 true。\n\n## 管理摘要（O5；`reporting.mask_identifiers` 未設定 → 預設遮罩；正文 243 字）\n\n> **對象：** CISO、IT 主管、廠務主管｜**日期：** 2026-09-08｜**信心：** 14/14 項高信心｜識別資訊已遮罩\n>\n> 1. 現況：14 項發現，5 項 P1（4 項對外曝露）；最急迫：VPN Gateway（A01）之 VPN appliance pre-auth RCE。\n> 2. 最可能路徑：internet → A01 → A04 → A06（可行性 6.4/10，未驗證），阻斷點為身分與網段控制。\n> 3. 決策請求：（1）核准 P1（5 項）修補排程與補償控制；（2）決定是否授權主動驗證（排除 OT；外部驗證另需外部掃描授權）。\n> 4. 限制：無重大資料缺漏；所有路徑為假設，模型未驗證實際曝險。\n\n## 追蹤指標\n\n| 指標 | 值 | 目標 |\n|---|---|---|\n| 對外曝露且 P1 的發現數 | 4 | 0（7 天內） |\n| P1/P2 發現總數 | 5 / 3 | 每週下降 |\n| 可達 crown jewel 的攻擊路徑假設數 | 9 | 每條至少一個已驗證阻斷點 |\n| 高信心比例 | 100% | ≥ 80% |\n| 資產清冊完整度（模擬） | 100% | ≥ 95% |\n| 未納入清冊的對外資產 | 1 | 0 |\n\n## 驗收對照（task-spec 第 7 節）\n\n| # | 檢查 | 預期 |\n|---|---|---|\n| 2 | `vpn-gw-01 / SYN-2026-0101` | P1；依據含對外曝露、公開利用程式、模擬 KEV、威脅情資命中 |\n| 3 | 路徑 | 含 `internet → vpn-gw-01 → ad-dc-01 → erp-db-01`，hypothesis |\n| 4 | 驗證計畫 | 每項「尚未授權主動測試」（`node scripts/run-demo.mjs` 驗證計畫段） |\n| 5 | 管理摘要 | 正體中文、正文 ≤ 300 字、含「決策請求」與「限制」（`run-demo.mjs` 管理摘要段） |\n| 6 | 移除 threat-intel.json（`--no-intel`） | 信心「中」；`SYN-2026-0101` 仍 P1；`mail-gw-01` 降 P2；`ad-dc-01` 降 P3；輸出列「未納入威脅情資」 |\n| 7 | 移除 scope.json（`--no-scope`） | 拒絕分析並列出必要欄位（exit code 2） |\n\n`node scripts/run-demo.mjs --json` 輸出符合 `skills/shared/output-schema.json` 的完整 JSON（九個必要區塊、`status: hypothesis`、`executive_summary.text` ≤ 300 字）。\n\n## 結尾聲明\n\n本分析由語言模型依使用者提供的資料整理，未驗證實際曝險；所有攻擊路徑為假設；任何主動測試與變更需人工授權。\n"
};
