import yaml from 'js-yaml';
import { clashFix } from '../../../utils/format-utils.js';
import { normalizeUnifiedTemplateModel } from '../template-model.js';

function mapGroupType(type) {
    const normalized = String(type || '').trim().toLowerCase();
    if (normalized === 'url-test' || normalized === 'fallback' || normalized === 'load-balance' || normalized === 'select') {
        return normalized;
    }
    return 'select';
}

function filterAutoSelectMembers(group) {
    const type = mapGroupType(group.type);
    const members = Array.isArray(group.members) ? group.members.filter(Boolean) : [];
    if (!['url-test', 'fallback', 'load-balance'].includes(type)) {
        return members;
    }
    return members.filter(member => !['DIRECT', 'REJECT', 'REJECT-DROP', 'PASS'].includes(String(member).toUpperCase()));
}

function toClashRuleProviderUrl(sourceUrl) {
    if (!/^https?:\/\//i.test(String(sourceUrl || ''))) return sourceUrl;

    try {
        const url = new URL(sourceUrl);
        if (!/raw\.githubusercontent\.com$/i.test(url.hostname)) return sourceUrl;
        if (!/\/Clash\/.*\.(list|txt)$/i.test(url.pathname)) return sourceUrl;

        const pathParts = url.pathname.split('/').filter(Boolean);
        const [owner, repo, ref, ...repoPathParts] = pathParts;
        const repoPath = `/${repoPathParts.join('/')}`;
        const yamlPath = repoPath.replace(/\.(list|txt)$/i, '.yaml');
        const ghCdn = new URL(`https://cdn.jsdelivr.net/gh/${owner}/${repo}@${ref}${yamlPath}`);

        if (/^blackmatrix7$/i.test(owner) && /^ios_rule_script$/i.test(repo) && /^\/rule\/Clash\//i.test(repoPath)) {
            return ghCdn.toString();
        }

        if (/\/Clash\/Ruleset\//i.test(repoPath)) {
            ghCdn.pathname = ghCdn.pathname.replace(/\/Clash\/Ruleset\//i, '/Clash/Providers/Ruleset/');
            return ghCdn.toString();
        }

        ghCdn.pathname = ghCdn.pathname.replace(/\/Clash\//i, '/Clash/Providers/');
        return ghCdn.toString();
    } catch {
        return sourceUrl;
    }
}

function getMrsRuleProviderKind(providerUrl) {
    try {
        const urlPath = new URL(providerUrl).pathname;
        const match = urlPath.match(/(?:^|\/)geo\/(geosite|geoip)\/[^/]+\.mrs$/i);
        if (!match) return null;
        return match[1].toLowerCase();
    } catch {
        return null;
    }
}

function createRuleProvider(providerUrl, providerName) {
    const mrsKind = getMrsRuleProviderKind(providerUrl);
    if (mrsKind) {
        return {
            type: 'http',
            behavior: mrsKind === 'geoip' ? 'ipcidr' : 'domain',
            format: 'mrs',
            url: providerUrl,
            path: `./ruleset/${providerName}.mrs`,
            interval: 86400
        };
    }

    return {
        type: 'http',
        behavior: 'classical',
        url: providerUrl,
        path: `./ruleset/${providerName}.yaml`,
        interval: 86400
    };
}

const DEFAULT_DNS_CONFIG = {
    enable: true,
    listen: '0.0.0.0:1053',
    ipv6: false,
    'enhanced-mode': 'fake-ip',
    'fake-ip-range': '198.18.0.1/16',
    'fake-ip-filter': [
        '*.lan',
        '*.local',
        '*.home.arpa',
        '*.localdomain',
        'home.arpa',
        'homeassistant.local',
        'localhost',
        'time.*.com',
        'ntp.*.com',
        '+.msftconnecttest.com',
        '+.msftncsi.com',
        '+.xiaohongshu.com',
        '+.xhscdn.com',
        '+.xhslink.com'
    ],
    'default-nameserver': [
        '223.5.5.5',
        '119.29.29.29'
    ],
    nameserver: [
        'https://dns.alidns.com/dns-query',
        'https://doh.pub/dns-query'
    ],
    'proxy-server-nameserver': [
        'https://dns.alidns.com/dns-query',
        'https://doh.pub/dns-query'
    ],
    'nameserver-policy': {
        '+.xiaohongshu.com': 'https://dns.alidns.com/dns-query',
        '+.xhscdn.com': 'https://dns.alidns.com/dns-query',
        '+.xhslink.com': 'https://dns.alidns.com/dns-query',
        '+.googleapis.com': 'https://1.1.1.1/dns-query#🚀 默认代理',
        '+.googleapis.cn': 'https://1.1.1.1/dns-query#🚀 默认代理',
        '+.googleusercontent.com': 'https://1.1.1.1/dns-query#🚀 默认代理',
        '+.gstatic.com': 'https://1.1.1.1/dns-query#🚀 默认代理',
        '+.gvt0.com': 'https://1.1.1.1/dns-query#🚀 默认代理',
        '+.gvt1.com': 'https://1.1.1.1/dns-query#🚀 默认代理',
        '+.gvt2.com': 'https://1.1.1.1/dns-query#🚀 默认代理',
        '+.gvt3.com': 'https://1.1.1.1/dns-query#🚀 默认代理',
        '+.xn--ngstr-lra8j.com': 'https://1.1.1.1/dns-query#🚀 默认代理',
        'geosite:cn': 'https://dns.alidns.com/dns-query',
        'geosite:geolocation-!cn': 'https://1.1.1.1/dns-query#🚀 默认代理'
    }
};

function appendRuleExtras(ruleText, extras) {
    const cleanedExtras = Array.isArray(extras)
        ? extras.map(item => String(item || '').trim()).filter(Boolean)
        : [];
    if (cleanedExtras.length === 0) return ruleText;
    return `${ruleText},${cleanedExtras.join(',')}`;
}

function mapRule(rule, ruleProviderMap) {
    const type = String(rule.type || '').toUpperCase();
    if (!type) return null;
    if (type === 'MATCH' || type === 'FINAL') return `MATCH,${rule.policy}`;
    if (type === 'GEOIP') return appendRuleExtras(`GEOIP,${rule.value || 'CN'},${rule.policy}`, rule.extras);
    if (type === 'RULE-SET') {
        const providerName = ruleProviderMap.get(rule.value);
        return appendRuleExtras(`RULE-SET,${providerName || rule.value},${rule.policy}`, rule.extras);
    }
    return appendRuleExtras(`${type},${rule.value},${rule.policy}`, rule.extras);
}

export function renderClashFromTemplateModel(model) {
    const normalizedModel = normalizeUnifiedTemplateModel(model);

    const ruleProviders = {};
    const ruleProviderMap = new Map();
    let providerCounter = 0;

    normalizedModel.rules.forEach(rule => {
        const type = String(rule.type || '').toUpperCase();
        if (type !== 'RULE-SET' || !rule.value || !/^https?:\/\//i.test(rule.value)) return;

        const providerUrl = toClashRuleProviderUrl(rule.value);
        if (ruleProviderMap.has(providerUrl)) return;

        let nameHint = 'rs';
        try {
            const urlPath = new URL(providerUrl).pathname;
            const fileName = urlPath.split('/').pop()?.replace(/\.(yaml|yml|list|txt|conf|mrs)$/i, '') || '';
            if (fileName && fileName.length > 2) {
                nameHint = fileName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
            }
        } catch {
            // ignore invalid provider url shapes and keep fallback name
        }

        const providerName = `${nameHint}_${providerCounter++}`;
        ruleProviderMap.set(providerUrl, providerName);
        ruleProviders[providerName] = createRuleProvider(providerUrl, providerName);
    });

    const config = {
        'mixed-port': 7890,
        'allow-lan': true,
        'mode': 'rule',
        'log-level': 'info',
        'ipv6': false,
        'tcp-concurrent': true,
        'external-controller': ':9090',
        'dns': DEFAULT_DNS_CONFIG,
        'proxies': normalizedModel.proxies,
        'proxy-groups': normalizedModel.groups
            .filter(group => Array.isArray(group.members) && group.members.length > 0)
            .map(group => {
                return {
                    name: group.name,
                    type: mapGroupType(group.type),
                    proxies: filterAutoSelectMembers(group),
                    ...group.options
                };
            }),
        'rule-providers': Object.keys(ruleProviders).length > 0 ? ruleProviders : undefined,
        'rules': normalizedModel.rules.map(rule => {
            if (String(rule.type || '').toUpperCase() !== 'RULE-SET' || !rule.value) {
                return mapRule(rule, ruleProviderMap);
            }
            return mapRule({ ...rule, value: toClashRuleProviderUrl(rule.value) }, ruleProviderMap);
        }).filter(Boolean),
        'profile': {
            'store-selected': true,
            'subscription-url': normalizedModel.settings.managedConfigUrl || ''
        }
    };

    let yamlStr = yaml.dump(config, {
        indent: 2,
        lineWidth: -1,
        noRefs: true,
        quotingType: '"',
        forceQuotes: false
    });
    yamlStr = clashFix(yamlStr);
    return yamlStr;
}
