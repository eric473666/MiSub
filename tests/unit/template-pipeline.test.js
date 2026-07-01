import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import yaml from 'js-yaml';
import { parseIniTemplate } from '../../functions/modules/subscription/template-parsers/ini-template-parser.js';
import { renderClashFromIniTemplate, renderLoonFromIniTemplate, renderQuanxFromIniTemplate, renderSingboxFromIniTemplate, renderSurgeFromIniTemplate } from '../../functions/modules/subscription/template-pipeline.js';
import { getBuiltinTemplate } from '../../functions/modules/subscription/builtin-template-registry.js';
import { buildShadowrocketConfig, buildShadowrocketNodeSubscriptionUrl } from '../../functions/modules/subscription/shadowrocket-config.js';

const SS2022_V2RAY_PLUGIN_NODE = 'ss://MjAyMi1ibGFrZTMtYWVzLTI1Ni1nY206TldSak1UVmxNVFZtTWpnMU5HRTVaRGsxT1dJd1pUUm1ZbVJrTnpkaU5qTT0@cf.090227.xyz:8080?plugin=v2ray-plugin%3Bmode%3Dwebsocket%3Bhost%3Dss.2227tsj.workers.dev%3Bpath%3D%2F%3Fenc%5C%3D2022-blake3-aes-256-gcm%3Bmux%3D0#2022-blake3-aes-256-gcm';

describe('Template pipeline', () => {
    it('should build Shadowrocket remote config with policy-path node loading', () => {
        const requestUrl = 'https://misub.example/profiles/home?target=shadowrocket-conf&refresh=1&nocache=1';
        const nodeUrl = buildShadowrocketNodeSubscriptionUrl(requestUrl);
        const parsedNodeUrl = new URL(nodeUrl);
        const rendered = buildShadowrocketConfig(requestUrl);

        expect(parsedNodeUrl.searchParams.get('target')).toBe('base64');
        expect(parsedNodeUrl.searchParams.get('builtin')).toBe('true');
        expect(parsedNodeUrl.searchParams.has('refresh')).toBe(false);
        expect(parsedNodeUrl.searchParams.has('nocache')).toBe(false);
        expect(rendered).toContain('[Proxy Group]');
        expect(rendered).toContain(`policy-path=${nodeUrl}`);
        expect(rendered).toContain('🌐 社交媒体 = select, 🇺🇸 LA 机房线路');
        expect(rendered).toContain('🛠 开发云服务 = select, 🇺🇸 LA 机房线路');
        expect(rendered).toContain('📚 学术新闻 = select, 🇺🇸 LA 机房线路');
        expect(rendered).toContain('DOMAIN-SUFFIX,x.com,🌐 社交媒体');
        expect(rendered).toContain('DOMAIN-SUFFIX,whatsapp.com,🌐 社交媒体');
        expect(rendered).toContain('DOMAIN-SUFFIX,github.com,🛠 开发云服务');
        expect(rendered).toContain('DOMAIN,registry.npmjs.org,🛠 开发云服务');
        expect(rendered).toContain('DOMAIN-SUFFIX,twitch.tv,🎥 流媒体');
        expect(rendered).toContain('DOMAIN-SUFFIX,wikipedia.org,📚 学术新闻');
        expect(rendered).toContain('DOMAIN,android.clients.google.com,📱 Google Play');
        expect(rendered).toContain('FINAL,🚀 默认代理');
    });

    it('should parse limited ini template into unified model', () => {
        const model = parseIniTemplate(`
[Proxy Group]
节点选择 = select, HK-01, JP-01, DIRECT
自动选择 = url-test, HK-01, JP-01, url=http://www.gstatic.com/generate_204, interval=300

[Rule]
DOMAIN-SUFFIX,google.com,节点选择
GEOIP,CN,DIRECT
MATCH,节点选择
        `, {
            fileName: 'Demo',
            targetFormat: 'clash'
        });

        expect(model.groups).toHaveLength(2);
        expect(model.rules).toHaveLength(3);
        expect(model.groups[0].name).toBe('节点选择');
        expect(model.rules[2].type).toBe('match');
    });

    it('should render clash yaml from limited ini template', () => {
        const rendered = renderClashFromIniTemplate(`
[Proxy Group]
节点选择 = select, HK-01, JP-01, DIRECT

[Rule]
DOMAIN-SUFFIX,google.com,节点选择
MATCH,节点选择
        `, {
            proxies: [
                { name: 'HK-01', type: 'trojan', server: '1.1.1.1', port: 443, password: 'pass' },
                { name: 'JP-01', type: 'trojan', server: '2.2.2.2', port: 443, password: 'pass' }
            ],
            managedConfigUrl: 'https://example.com/sub'
        });

        const parsed = yaml.load(rendered);
        expect(parsed['proxy-groups'][0].name).toBe('节点选择');
        expect(parsed.rules).toContain('MATCH,节点选择');
        expect(parsed.profile['subscription-url']).toBe('https://example.com/sub');
        expect(parsed.ipv6).toBe(false);
        expect(parsed.dns['enhanced-mode']).toBe('fake-ip');
        expect(parsed.dns['fake-ip-filter']).toContain('+.xiaohongshu.com');
        expect(parsed.dns['nameserver-policy']['geosite:geolocation-!cn']).toContain('https://1.1.1.1/dns-query#🚀 默认代理');
    });

    it('should exclude DIRECT from auto-select groups when rendering templates', () => {
        const rendered = renderClashFromIniTemplate(`
[Proxy Group]
节点选择 = select, 自动选择, DIRECT
自动选择 = url-test, HK-01, JP-01, DIRECT

[Rule]
MATCH,节点选择
        `, {
            proxies: [
                { name: 'HK-01', type: 'trojan', server: '1.1.1.1', port: 443, password: 'pass' },
                { name: 'JP-01', type: 'trojan', server: '2.2.2.2', port: 443, password: 'pass' }
            ]
        });

        const parsed = yaml.load(rendered);
        const autoSelectGroup = parsed['proxy-groups'].find(group => group.name === '自动选择');
        expect(autoSelectGroup.proxies).toEqual(['HK-01', 'JP-01']);
        expect(autoSelectGroup.proxies).not.toContain('DIRECT');
    });

    it('should expand regex proxy groups for Clash without emitting filter fields', () => {
        const rendered = renderClashFromIniTemplate(`
[custom]
custom_proxy_group=👋 手动切换\`select\`.*
custom_proxy_group=🇭🇰 香港日常\`url-test\`(HK-VMISS|HK-ZGO)\`http://www.gstatic.com/generate_204\`300,,50
ruleset=👋 手动切换,[]FINAL
        `, {
            proxies: [
                { name: '🇭🇰 手动节点 - HK-VMISS', type: 'trojan', server: '1.1.1.1', port: 443, password: 'pass' },
                { name: '🇭🇰 手动节点 - HK-ZGO', type: 'trojan', server: '1.1.1.2', port: 443, password: 'pass' },
                { name: '🇺🇸 手动节点 - LA-BWD', type: 'trojan', server: '1.1.1.3', port: 443, password: 'pass' }
            ]
        });

        const parsed = yaml.load(rendered);
        const manualGroup = parsed['proxy-groups'].find(group => group.name === '👋 手动切换');
        const hkGroup = parsed['proxy-groups'].find(group => group.name === '🇭🇰 香港日常');

        expect(manualGroup.proxies).toEqual([
            '🇭🇰 手动节点 - HK-VMISS',
            '🇭🇰 手动节点 - HK-ZGO',
            '🇺🇸 手动节点 - LA-BWD'
        ]);
        expect(hkGroup.proxies).toEqual([
            '🇭🇰 手动节点 - HK-VMISS',
            '🇭🇰 手动节点 - HK-ZGO'
        ]);
        expect(parsed['proxy-groups'].every(group => group.filter === undefined)).toBe(true);
        expect(rendered).not.toContain('\n    filter:');
        expect(rendered).not.toContain('\n  filter:');
    });

    it('should render the active custom Clash template for the current manual nodes', () => {
        const template = fs.readFileSync('public/misub-custom-clash.ini', 'utf8');
        const rendered = renderClashFromIniTemplate(template, {
            proxies: [
                { name: '🇺🇸 手动节点 - US-USAT3-via-BWH', type: 'trojan', server: '192.0.2.1', port: 443, password: 'pass' },
                { name: '🇺🇸 手动节点 - US-USAT3-via-HK', type: 'trojan', server: '192.0.2.2', port: 443, password: 'pass' },
                { name: '🇺🇸 手动节点 - US-USAT3-via-DMIT', type: 'trojan', server: '192.0.2.3', port: 443, password: 'pass' },
                { name: '🇺🇸 手动节点 - US-USAT3', type: 'trojan', server: '192.0.2.4', port: 443, password: 'pass' },
                { name: '🇭🇰 手动节点 - HK-HKT3', type: 'trojan', server: '192.0.2.5', port: 443, password: 'pass' },
                { name: '🇬🇧 手动节点 - UK-GUID2', type: 'trojan', server: '192.0.2.6', port: 443, password: 'pass' },
                { name: '🇭🇰 手动节点 - HK-HKT3-via-HK', type: 'trojan', server: '192.0.2.7', port: 443, password: 'pass' },
                { name: '🇬🇧 手动节点 - UK-GUID2-via-HK', type: 'trojan', server: '192.0.2.8', port: 443, password: 'pass' },
                { name: '🇬🇧 手动节点 - UK-LISA-via-HK', type: 'trojan', server: '192.0.2.9', port: 443, password: 'pass' },
                { name: '🇯🇵 手动节点 - JP-JPKD2-via-HK', type: 'trojan', server: '192.0.2.10', port: 443, password: 'pass' },
                { name: '🇯🇵 手动节点 - JP-JPKD2', type: 'trojan', server: '192.0.2.11', port: 443, password: 'pass' },
                { name: '🇺🇸 手动节点 - US-DMIT', type: 'trojan', server: '192.0.2.12', port: 443, password: 'pass' },
                { name: '🇬🇧 手动节点 - UK-LISA-via-BWH', type: 'trojan', server: '192.0.2.13', port: 443, password: 'pass' },
                { name: '🇺🇸 手动节点 - US-BWH', type: 'trojan', server: '192.0.2.14', port: 443, password: 'pass' },
                { name: '🇬🇧 手动节点 - UK-LISA', type: 'trojan', server: '192.0.2.15', port: 443, password: 'pass' },
                { name: '🇭🇰 手动节点 - HK-VMISS', type: 'trojan', server: '192.0.2.16', port: 443, password: 'pass' },
                { name: '🇺🇸 手动节点 - US-ZG-LA', type: 'trojan', server: '192.0.2.17', port: 443, password: 'pass' },
                { name: '🇭🇰 手动节点 - HK-ZGO', type: 'trojan', server: '192.0.2.18', port: 443, password: 'pass' }
            ]
        });

        const parsed = yaml.load(rendered);
        const groups = Object.fromEntries(parsed['proxy-groups'].map(group => [group.name, group]));

        expect(parsed['proxy-groups'].every(group => group.filter === undefined)).toBe(true);
        expect(rendered).not.toContain('\n    filter:');
        expect(groups['🇺🇸 BWH-LA 日常']).toBeUndefined();
        expect(groups['🇺🇸 DMIT/LA 日常']).toBeUndefined();
        expect(groups['🇬🇧 英国出口']).toBeUndefined();
        expect(groups['🚀 默认代理'].proxies).toEqual([
            '🇺🇸 LA 机房线路',
            '♻️ 日常自动',
            '🇭🇰 香港日常',
            '👋 手动切换',
            'DIRECT',
            '🏠 家宽池'
        ]);
        expect(groups['🇺🇸 LA 机房线路'].type).toBe('select');
        expect(groups['🇺🇸 LA 机房线路'].proxies).toEqual([
            '🇺🇸 手动节点 - US-BWH',
            '🇺🇸 手动节点 - US-DMIT'
        ]);
        expect(groups['♻️ 日常自动'].proxies).toEqual(['🇺🇸 LA 机房线路', '🇭🇰 香港日常']);
        expect(groups['🇭🇰 香港日常'].proxies).toEqual([
            '🇭🇰 手动节点 - HK-VMISS',
            '🇭🇰 手动节点 - HK-ZGO',
            '🇭🇰 手动节点 - HK-HKT3-via-HK',
            '🇭🇰 手动节点 - HK-HKT3'
        ]);
        expect(groups['🇺🇸 美国落地'].proxies).toEqual([
            '🇺🇸 手动节点 - US-USAT3',
            '🇺🇸 手动节点 - US-USAT3-via-BWH',
            '🇺🇸 手动节点 - US-USAT3-via-HK',
            '🇺🇸 手动节点 - US-USAT3-via-DMIT'
        ]);
        expect(groups['🇭🇰 HKT3 落地'].proxies).toEqual([
            '🇭🇰 手动节点 - HK-HKT3',
            '🇭🇰 手动节点 - HK-HKT3-via-HK'
        ]);
        expect(groups['🇬🇧 GUID2 落地'].proxies).toEqual([
            '🇬🇧 手动节点 - UK-GUID2',
            '🇬🇧 手动节点 - UK-GUID2-via-HK'
        ]);
        expect(groups['🇬🇧 LISA 落地'].proxies).toEqual([
            '🇬🇧 手动节点 - UK-LISA',
            '🇬🇧 手动节点 - UK-LISA-via-BWH',
            '🇬🇧 手动节点 - UK-LISA-via-HK'
        ]);
        expect(groups['🇬🇧 英国落地'].proxies).toEqual([
            '🇬🇧 LISA 落地',
            '🇬🇧 GUID2 落地',
            '👋 手动切换'
        ]);
        expect(groups['🇯🇵 日本落地'].proxies).toEqual([
            '🇭🇰 香港日常',
            '🇺🇸 LA 机房线路',
            '🇯🇵 手动节点 - JP-JPKD2-via-HK',
            '🇯🇵 手动节点 - JP-JPKD2'
        ]);
        expect(groups['🇹🇼 台湾落地']).toBeUndefined();
        expect(groups['🌐 社交媒体'].proxies).toEqual([
            '🇺🇸 LA 机房线路',
            '♻️ 日常自动',
            '🇭🇰 香港日常',
            '👋 手动切换',
            'DIRECT'
        ]);
        expect(groups['🛠 开发云服务'].proxies).toEqual([
            '🇺🇸 LA 机房线路',
            '♻️ 日常自动',
            '🇭🇰 香港日常',
            '👋 手动切换',
            'DIRECT'
        ]);
        expect(groups['📚 学术新闻'].proxies).toEqual([
            '🇺🇸 LA 机房线路',
            '♻️ 日常自动',
            '🇭🇰 香港日常',
            '👋 手动切换',
            'DIRECT'
        ]);
        expect(groups['📱 Google Play'].type).toBe('fallback');
        expect(groups['📱 Google Play'].proxies).toEqual([
            '🇭🇰 香港日常',
            '🇺🇸 LA 机房线路',
            '♻️ 日常自动',
            '👋 手动切换'
        ]);
        expect(groups['📦 PikPak'].proxies).toEqual([
            '🇺🇸 LA 机房线路',
            '🇭🇰 香港日常',
            '♻️ 日常自动',
            '👋 手动切换',
            'DIRECT'
        ]);
        expect(groups['🏠 家宽池'].proxies).toEqual([
            '🇺🇸 美国落地',
            '🇬🇧 英国落地',
            '🇯🇵 日本落地',
            '🇭🇰 HKT3 落地',
            '👋 手动切换'
        ]);
        expect(groups['💻 Codex']).toBeUndefined();
        expect(groups['🤖 智能 AI'].proxies.slice(0, 4)).toEqual([
            '🇺🇸 美国落地',
            '🇺🇸 LA 机房线路',
            '🇯🇵 日本落地',
            '🇬🇧 英国落地'
        ]);
        expect(groups['🏰 Disney'].proxies[0]).toBe('🇺🇸 美国落地');
        expect(groups['🤖 智能 AI'].proxies).toContain('🇺🇸 LA 机房线路');
        expect(groups['🤖 智能 AI'].proxies).not.toContain('♻️ 日常自动');
        expect(groups['🎙 AI 语音解说'].proxies).not.toContain('♻️ 日常自动');
        expect(parsed.rules).toContain('DOMAIN-SUFFIX,chatgpt.com,🤖 智能 AI');
        expect(parsed.rules).not.toContain('DOMAIN,codex.openai.com,💻 Codex');
        expect(parsed.rules).toContain('DOMAIN-SUFFIX,elevenlabs.io,🎙 AI 语音解说');
        expect(parsed.rules).toContain('DOMAIN-SUFFIX,cartesia.ai,🎙 AI 语音解说');
        expect(parsed.rules).toContain('DOMAIN-SUFFIX,sora.com,🎬 AI 视频生成');
        expect(parsed.rules).toContain('DOMAIN-SUFFIX,veo.google.com,🎬 AI 视频生成');
        expect(parsed.rules).toContain('DOMAIN,gemini.google.com,🤖 智能 AI');
        expect(parsed.rules).toContain('DOMAIN-SUFFIX,openrouter.ai,🤖 智能 AI');
        expect(parsed.rules).toContain('DOMAIN-SUFFIX,apple-cloudkit.com,🍎 Apple');
        expect(parsed.rules).toContain('DOMAIN,time.apple.com,🍎 Apple');
        expect(parsed.rules).toContain('DOMAIN-SUFFIX,bbc.co.uk,🇬🇧 英国媒体');
        expect(parsed.rules).toContain('DOMAIN-SUFFIX,x.com,🌐 社交媒体');
        expect(parsed.rules).toContain('DOMAIN-SUFFIX,instagram.com,🌐 社交媒体');
        expect(parsed.rules).toContain('DOMAIN-SUFFIX,cdninstagram.com,🌐 社交媒体');
        expect(parsed.rules).toContain('DOMAIN-SUFFIX,video.twimg.com,🌐 社交媒体');
        expect(parsed.rules).toContain('DOMAIN-SUFFIX,whatsapp.com,🌐 社交媒体');
        expect(parsed.rules).toContain('DOMAIN-SUFFIX,discord.com,🌐 社交媒体');
        expect(parsed.rules).toContain('DOMAIN-SUFFIX,reddit.com,🌐 社交媒体');
        expect(parsed.rules).toContain('DOMAIN-SUFFIX,linkedin.com,🌐 社交媒体');
        expect(parsed.rules).toContain('DOMAIN-SUFFIX,github.com,🛠 开发云服务');
        expect(parsed.rules).toContain('DOMAIN-SUFFIX,docker.io,🛠 开发云服务');
        expect(parsed.rules).toContain('DOMAIN,registry.npmjs.org,🛠 开发云服务');
        expect(parsed.rules).toContain('DOMAIN-SUFFIX,twitch.tv,🎥 流媒体');
        expect(parsed.rules).toContain('DOMAIN-SUFFIX,dazn.com,🎥 流媒体');
        expect(parsed.rules).toContain('DOMAIN,tv.apple.com,🎥 流媒体');
        expect(parsed.rules).toContain('DOMAIN-SUFFIX,biliintl.com,🎥 流媒体');
        expect(parsed.rules).toContain('DOMAIN-SUFFIX,nicovideo.jp,🎥 流媒体');
        expect(parsed.rules).toContain('DOMAIN-SUFFIX,coursera.org,📚 学术新闻');
        expect(parsed.rules).toContain('DOMAIN-SUFFIX,wikipedia.org,📚 学术新闻');
        expect(parsed.rules).toContain('DOMAIN-SUFFIX,nytimes.com,📚 学术新闻');
        expect(parsed.rules).toContain('DOMAIN,homeassistant.local,DIRECT');
        expect(parsed.rules).toContain('IP-CIDR,192.168.5.0/24,DIRECT,no-resolve');
        expect(parsed.rules).toContain('IP-CIDR,192.168.20.0/24,DIRECT,no-resolve');
        expect(parsed.rules).toContain('DOMAIN,android.clients.google.com,📱 Google Play');
        expect(parsed.rules).toContain('DOMAIN,play.googleapis.com,📱 Google Play');
        expect(parsed.rules).toContain('DOMAIN-SUFFIX,gvt1.com,📱 Google Play');
        expect(parsed.rules).toContain('DOMAIN-SUFFIX,mypikpak.com,📦 PikPak');
        expect(parsed.rules).toContain('DOMAIN-SUFFIX,mypikpak.net,📦 PikPak');
        expect(parsed.rules).toContain('DOMAIN-SUFFIX,pikpak.com,📦 PikPak');
        expect(parsed.rules).toContain('DOMAIN-SUFFIX,pikpakdrive.com,📦 PikPak');
        expect(parsed.rules).toContain('DOMAIN-SUFFIX,pikpak.me,📦 PikPak');
        expect(parsed.rules).toContain('DOMAIN-SUFFIX,pikpak.io,📦 PikPak');
        expect(parsed.rules).toContain('DOMAIN-SUFFIX,pickpackapp.com,📦 PikPak');
        expect(parsed.rules).toContain('DOMAIN-KEYWORD,mypikpak,📦 PikPak');
        expect(parsed.rules).toContain('DOMAIN-KEYWORD,pikpak,📦 PikPak');
        expect(parsed.rules.indexOf('DOMAIN-SUFFIX,googleapis.cn,📱 Google Play')).toBeLessThan(
            parsed.rules.indexOf('DOMAIN-SUFFIX,cn,DIRECT')
        );
        expect(parsed.rules.indexOf('DOMAIN-KEYWORD,pikpak,📦 PikPak')).toBeLessThan(
            parsed.rules.indexOf('DOMAIN-SUFFIX,cn,DIRECT')
        );
        expect(parsed.ipv6).toBe(false);
        expect(parsed['tcp-concurrent']).toBe(true);
        expect(parsed.dns['fake-ip-filter']).toContain('homeassistant.local');
        expect(parsed.dns['fake-ip-filter']).toContain('*.home.arpa');
        expect(parsed.dns['fake-ip-filter']).toContain('+.xhscdn.com');
        expect(parsed.dns['nameserver-policy']['+.xhscdn.com']).toBe('https://dns.alidns.com/dns-query');
        expect(parsed.dns['nameserver-policy']['+.googleapis.cn']).toBe('https://1.1.1.1/dns-query#🚀 默认代理');
        expect(parsed.dns['nameserver-policy']['+.gvt1.com']).toBe('https://1.1.1.1/dns-query#🚀 默认代理');
        expect(parsed.dns['nameserver-policy']['geosite:geolocation-!cn']).toBe('https://1.1.1.1/dns-query#🚀 默认代理');
        const providers = parsed['rule-providers'] || {};
        const providerUrls = Object.values(providers).map(provider => provider.url);
        expect(providerUrls.some(url => String(url).includes('/rule/Clash/Google/Google.yaml'))).toBe(true);
        expect(providerUrls.some(url => String(url).includes('/geo/geosite/pikpak.mrs'))).toBe(true);
        expect(providerUrls.some(url => String(url).includes('/rule/Clash/PikPak/PikPak.yaml'))).toBe(true);
        expect(providerUrls.every(url => !String(url).includes('/rule/Clash/Providers/'))).toBe(true);
        const twitterIpProvider = Object.entries(providers).find(([, provider]) => String(provider.url).includes('/geo/geoip/twitter.mrs'));
        const githubProvider = Object.entries(providers).find(([, provider]) => String(provider.url).includes('/geo/geosite/github.mrs'));
        const privateIpProvider = Object.entries(providers).find(([, provider]) => String(provider.url).includes('/geo/geoip/private.mrs'));
        expect(twitterIpProvider?.[1]).toMatchObject({
            behavior: 'ipcidr',
            format: 'mrs'
        });
        expect(twitterIpProvider?.[1].path).toMatch(/\.mrs$/);
        expect(githubProvider?.[1]).toMatchObject({
            behavior: 'domain',
            format: 'mrs'
        });
        expect(privateIpProvider?.[1]).toMatchObject({
            behavior: 'ipcidr',
            format: 'mrs'
        });
        expect(parsed.rules).toContain(`RULE-SET,${twitterIpProvider?.[0]},🌐 社交媒体,no-resolve`);
        expect(parsed.rules).toContain(`RULE-SET,${privateIpProvider?.[0]},DIRECT,no-resolve`);
    });

    it('should keep Clash template relay-like groups as plain select without dialer-proxy', () => {
        const rendered = renderClashFromIniTemplate(`
[Proxy Group]
🔗 链式代理 = select, 入口节点, HK-01, DIRECT
入口节点 = select, HK-01, DIRECT

[Rule]
MATCH,🔗 链式代理
        `, {
            proxies: [
                { name: 'HK-01', type: 'trojan', server: '1.1.1.1', port: 443, password: 'pass' }
            ]
        });

        const parsed = yaml.load(rendered);
        const relayLikeGroup = parsed['proxy-groups'].find(group => group.name === '🔗 链式代理');
        expect(relayLikeGroup.type).toBe('select');
        expect(relayLikeGroup.proxies).toEqual(['入口节点', 'HK-01', 'DIRECT']);
        expect(relayLikeGroup['dialer-proxy']).toBeUndefined();
    });

    it('should merge duplicate proxy groups with the same name before rendering', () => {
        const rendered = renderClashFromIniTemplate(`
[Proxy Group]
节点选择 = select, HK-01
节点选择 = select, JP-01, DIRECT
自动选择 = url-test, HK-01, JP-01

[Rule]
MATCH,节点选择
        `, {
            proxies: [
                { name: 'HK-01', type: 'trojan', server: '1.1.1.1', port: 443, password: 'pass' },
                { name: 'JP-01', type: 'trojan', server: '2.2.2.2', port: 443, password: 'pass' }
            ]
        });

        const parsed = yaml.load(rendered);
        const selectGroups = parsed['proxy-groups'].filter(group => group.name === '节点选择');
        expect(selectGroups).toHaveLength(1);
        expect(selectGroups[0].proxies).toContain('HK-01');
        expect(selectGroups[0].proxies).toContain('JP-01');
        expect(selectGroups[0].proxies).toContain('DIRECT');
    });

    it('should parse builtin ACL4SSR custom template registry entry', () => {
        const builtinTemplate = getBuiltinTemplate('clash_acl4ssr_full');
        const model = parseIniTemplate(builtinTemplate.content, {
            fileName: 'ACL4SSR',
            targetFormat: 'clash'
        });

        expect(model.groups.length).toBeGreaterThan(10);
        expect(model.rules.some(rule => rule.type === 'rule-set')).toBe(true);
        expect(model.groups.some(group => group.name === '🚀 节点选择')).toBe(true);
    });

    it('should render sing-box json from ACL4SSR custom template', () => {
        const builtinTemplate = getBuiltinTemplate('clash_acl4ssr_full');
        const rendered = renderSingboxFromIniTemplate(builtinTemplate.content, {
            nodeList: [
                'trojan://password@1.2.3.4:443#HK-01',
                'vmess://eyJ2IjoiMiIsInBzIjoiSlAtMDEiLCJhZGQiOiIxLjIuMy41IiwicG9ydCI6IjQ0MyIsImlkIjoidXVpZC0xMjM0IiwiYWlkIjoiMCIsIm5ldCI6IndzIiwidHlwZSI6Im5vbmUiLCJob3N0IjoiZXhhbXBsZS5jb20iLCJwYXRoIjoiL3dzIiwidGxzIjoidGxzIn0'
            ].join('\n'),
            targetFormat: 'singbox'
        });
        const parsed = JSON.parse(rendered);

        expect(Array.isArray(parsed.outbounds)).toBe(true);
        expect(parsed.outbounds.some(outbound => outbound.tag === '🚀 节点选择')).toBe(true);
        expect(parsed.outbounds.some(outbound => outbound.tag === '🇭🇰 HK-01')).toBe(true);
        expect(parsed.outbounds.some(outbound => outbound.tag === '🇯🇵 JP-01' && outbound.type === 'vmess')).toBe(true);
        expect(Array.isArray(parsed.route.rule_set)).toBe(true);
        expect(parsed.route.rule_set.length).toBeGreaterThan(0);
        const aclRuleSets = parsed.route.rule_set.filter(ruleSet => String(ruleSet.url).endsWith('.list'));
        expect(aclRuleSets.length).toBeGreaterThan(0);
        expect(aclRuleSets.every(ruleSet => ruleSet.format === 'source')).toBe(true);
    });

    it('should render surge config sections from ACL4SSR custom template', () => {
        const builtinTemplate = getBuiltinTemplate('clash_acl4ssr_full');
        const rendered = renderSurgeFromIniTemplate(builtinTemplate.content, {
            nodeList: [
                'trojan://password@1.2.3.4:443#HK-01',
                'ss://YWVzLTEyOC1nY206cGFzc3dvcmQ=@1.2.3.5:8388#JP-01'
            ].join('\n'),
            targetFormat: 'surge&ver=4'
        });

        expect(rendered).toContain('[Proxy]');
        expect(rendered).toContain('[Proxy Group]');
        expect(rendered).toContain('[Rule]');
        expect(rendered).toContain('🚀 节点选择 = select');
    });

    it('should render loon and quanx config sections from ACL4SSR custom template', () => {
        const builtinTemplate = getBuiltinTemplate('clash_acl4ssr_full');
        const nodeList = [
            'trojan://password@1.2.3.4:443#HK-01',
            'ss://YWVzLTEyOC1nY206cGFzc3dvcmQ=@1.2.3.5:8388#JP-01',
            'vmess://eyJ2IjoiMiIsInBzIjoiVVMtMDEiLCJhZGQiOiIxLjIuMy42IiwicG9ydCI6IjQ0MyIsImlkIjoidXVpZC01Njc4IiwiYWlkIjoiMCIsIm5ldCI6IndzIiwiaG9zdCI6ImV4YW1wbGUuY29tIiwicGF0aCI6Ii93cyIsInRscyI6InRscyJ9',
            'vless://uuid-9999@1.2.3.7:443?security=reality&type=grpc&serviceName=edge&pbk=testpublickey&sid=abcd&sni=example.com#SG-01',
            'wireguard://privatekey@1.2.3.8:51820?publickey=peerpub&reserved=1,2,3&address=172.16.0.2/32#WG-01'
        ].join('\n');

        const loonRendered = renderLoonFromIniTemplate(builtinTemplate.content, { nodeList, targetFormat: 'loon' });
        const quanxRendered = renderQuanxFromIniTemplate(builtinTemplate.content, { nodeList, targetFormat: 'quanx' });
        const surgeRendered = renderSurgeFromIniTemplate(builtinTemplate.content, { nodeList, targetFormat: 'surge&ver=4' });

        expect(loonRendered).toContain('[Proxy]');
        expect(loonRendered).toContain('[Proxy Group]');
        expect(loonRendered).toContain('[Rule]');
        expect(loonRendered).toContain('SG-01 = vless');
        expect(loonRendered).toContain('grpc-service-name=edge');
        expect(loonRendered).toContain('reality=true');
        expect(loonRendered).toContain('WG-01 = wireguard');
        expect(loonRendered).toContain('RULE-SET,https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Ruleset/OpenAi.list,🤖 OpenAi');
        expect(loonRendered).toContain('🚀 节点选择 = select');
        expect(quanxRendered).toContain('[server_local]');
        expect(quanxRendered).toContain('[policy]');
        expect(quanxRendered).toContain('[filter_remote]');
        expect(quanxRendered).toContain('[filter_local]');
        expect(quanxRendered).toContain('vmess=1.2.3.6:443, method=none, password=uuid-5678, obfs=wss, obfs-uri=/ws, obfs-host=example.com, tag=🇺🇸 US-01');
        expect(quanxRendered).not.toContain('vmess=1.2.3.6:443, method=none, password=uuid-5678, obfs=ws,');
        expect(quanxRendered).toContain('filter_remote, https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Ruleset/OpenAi.list, tag=🤖 OpenAi, force-policy=🤖 OpenAi, update-interval=86400, enabled=true');
        expect(quanxRendered).toContain('static=🚀 节点选择');
        expect(surgeRendered).not.toContain('SG-01 = vless');
        expect(surgeRendered).toContain('WG-01 = wireguard');
        expect(surgeRendered).toContain('RULE-SET,https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Ruleset/OpenAi.list,🤖 OpenAi');
        expect(surgeRendered).toContain('🚀 节点选择 = select');
    });

    it('should render Loon vmess and trojan proxies with compatible syntax', () => {
        const loonRendered = renderLoonFromIniTemplate(`
[Proxy]
custom_proxy_group=TestGroup` , {
            nodeList: [
                'vmess://eyJ2IjoiMiIsInBzIjoiVk1FU1MtV1MiLCJhZGQiOiJzYWFzLnNpbi5mYW4iLCJwb3J0IjoiNDQzIiwiaWQiOiIwYTRhMGJhMS1iZjAyLTQyOTgtYmYxNi0xOWExZjg2MzkzZmEiLCJhaWQiOiIwIiwic2N5IjoiYXV0byIsIm5ldCI6IndzIiwidHlwZSI6Im5vbmUiLCJob3N0Ijoia3lqcC5zdG9vLnVzLmNpIiwicGF0aCI6Ii92bWVzcy1hcmdvP2VkPTI1NjAiLCJ0bHMiOiJ0bHMiLCJzbmkiOiJreWpwLnN0b28udXMuY2kiLCJmcCI6ImZpcmVmb3gifQ==',
                'trojan://0a4a0ba1-bf02-4298-bf16-19a1f86393fa@saas.sin.fan:443?security=tls&sni=kyjp.stoo.us.ci&fp=firefox&insecure=0&allowInsecure=0&type=ws&host=kyjp.stoo.us.ci&path=%2Ftrojan-argo%3Fed%3D2560#Trojan-WS'
            ].join('\n'),
            targetFormat: 'loon'
        });

        expect(loonRendered).toContain('VMESS-WS = vmess, saas.sin.fan, 443, auto, "0a4a0ba1-bf02-4298-bf16-19a1f86393fa", 0, over-tls=true, transport=ws, path=/vmess-argo?ed=2560, host=kyjp.stoo.us.ci, sni=kyjp.stoo.us.ci');
        expect(loonRendered).toContain('Trojan-WS = trojan, saas.sin.fan, 443, 0a4a0ba1-bf02-4298-bf16-19a1f86393fa, transport=ws, path=/trojan-argo?ed=2560, host=kyjp.stoo.us.ci, sni=kyjp.stoo.us.ci');
        expect(loonRendered).not.toContain(', tls=true');
        expect(loonRendered).not.toContain('password=0a4a0ba1-bf02-4298-bf16-19a1f86393fa');
    });

    it('should render Loon vless ws with path host and over-tls syntax', () => {
        const loonRendered = renderLoonFromIniTemplate(`
[Proxy]
custom_proxy_group=TestGroup`, {
            nodeList: 'vless://0a4a0ba1-bf02-4298-bf16-19a1f86393fa@saas.sin.fan:443?encryption=none&security=tls&sni=kyjp.stoo.us.ci&fp=firefox&insecure=0&allowInsecure=0&type=ws&host=kyjp.stoo.us.ci&path=%2Fvless-argo%3Fed%3D2560#VLESS-WS',
            targetFormat: 'loon'
        });

        expect(loonRendered).toContain('VLESS-WS = vless, saas.sin.fan, 443, 0a4a0ba1-bf02-4298-bf16-19a1f86393fa, transport=ws, path=/vless-argo?ed=2560, host=kyjp.stoo.us.ci, over-tls=true, sni=kyjp.stoo.us.ci');
        expect(loonRendered).not.toContain(', tls=true');
    });

    it('should render Loon anytls syntax', () => {
        const loonRendered = renderLoonFromIniTemplate(`
[Proxy]
custom_proxy_group=TestGroup`, {
            nodeList: 'anytls://9d6c62f6-e38d-4146-ab3e-d40568555f89@156.239.232.67:443/?sni=xkhkfree.99887766.best&alpn=h2%2Ch3&allowInsecure=1#AnyTLS-HK',
            targetFormat: 'loon'
        });

        expect(loonRendered).toContain('AnyTLS-HK = anytls, 156.239.232.67, 443, 9d6c62f6-e38d-4146-ab3e-d40568555f89, sni=xkhkfree.99887766.best, alpn=h2,h3, skip-cert-verify=true');
    });

    it('should render Surge tuic syntax for sample nodes', () => {
        const surgeRendered = renderSurgeFromIniTemplate(`
[Proxy]
custom_proxy_group=TestGroup`, {
            nodeList: 'tuic://a276f4e4-08b4-4a03-bfe8-f36ef17ad133:a276f4e4-08b4-4a03-bfe8-f36ef17ad133@5.45.102.158:39689?congestion_control=bbr&udp_relay_mode=native&alpn=h3&sni=www.bing.com&allow_insecure=1&allowInsecure=1#TUIC-Surge',
            targetFormat: 'surge&ver=4'
        });

        expect(surgeRendered).toContain('TUIC-Surge = tuic, 5.45.102.158, 39689, token=a276f4e4-08b4-4a03-bfe8-f36ef17ad133:a276f4e4-08b4-4a03-bfe8-f36ef17ad133, sni=www.bing.com, congestion-control=bbr, udp-relay=true, alpn=h3, skip-cert-verify=true');
    });

    it('should skip vless nodes when rendering Surge configs', () => {
        const surgeRendered = renderSurgeFromIniTemplate(`
[Proxy]
custom_proxy_group=TestGroup`, {
            nodeList: 'vless://uuid-9999@1.2.3.7:443?security=reality&type=grpc&serviceName=edge&pbk=testpublickey&sid=abcd&sni=example.com#SG-01',
            targetFormat: 'surge&ver=4'
        });

        expect(surgeRendered).not.toContain('SG-01 = vless');
        expect(surgeRendered).not.toContain('grpc-service-name=edge');
        expect(surgeRendered).not.toContain('reality=true');
    });

    it('should render QuanX tuic and anytls syntax while skipping unsupported hysteria2', () => {
        const quanxRendered = renderQuanxFromIniTemplate(`
[Proxy]
custom_proxy_group=TestGroup`, {
            nodeList: [
                'hysteria2://a276f4e4-08b4-4a03-bfe8-f36ef17ad133@5.45.102.158:11416?security=tls&alpn=h3&insecure=1&mport=&sni=www.bing.com#HY2-QX',
                'tuic://a276f4e4-08b4-4a03-bfe8-f36ef17ad133:a276f4e4-08b4-4a03-bfe8-f36ef17ad133@5.45.102.158:39689?congestion_control=bbr&udp_relay_mode=native&alpn=h3&sni=www.bing.com&allow_insecure=1&allowInsecure=1#TUIC-QX',
                'anytls://9d6c62f6-e38d-4146-ab3e-d40568555f89@156.239.232.67:443/?sni=xkhkfree.99887766.best&alpn=h2%2Ch3&allowInsecure=1#AnyTLS-QX'
            ].join('\n'),
            targetFormat: 'quanx'
        });

        expect(quanxRendered).not.toContain('hysteria2=');
        expect(quanxRendered).toContain('tuic=5.45.102.158:39689, a276f4e4-08b4-4a03-bfe8-f36ef17ad133, a276f4e4-08b4-4a03-bfe8-f36ef17ad133, sni=www.bing.com, congestion-controller=bbr, udp-relay=native, alpn=h3, tls-verification=false, tag=🌍 TUIC-QX');
        expect(quanxRendered).toContain('anytls=156.239.232.67:443, password=9d6c62f6-e38d-4146-ab3e-d40568555f89, sni=xkhkfree.99887766.best, alpn=h2,h3, tls-verification=false, tag=🌍 AnyTLS-QX');
    });

    it('should render QuanX vmess ws tls tag at the end in template output', () => {
        const vmessConfig = Buffer.from(JSON.stringify({
            v: '2', ps: 'VMESS 节点', add: 'ip.sb', port: '443',
            id: '6f4e029b-099f-45f6-afd2-33f0e8f86f15', aid: '0', scy: 'auto',
            net: 'ws', type: 'none', host: 'gbwarp.owg.dpdns.org', path: '/vmess-argo?ed=2560',
            tls: 'tls', sni: 'gbwarp.owg.dpdns.org'
        })).toString('base64');
        const quanxRendered = renderQuanxFromIniTemplate(`[Proxy]`, {
            nodeList: `vmess://${vmessConfig}`,
            targetFormat: 'quanx'
        });
        const line = quanxRendered.split('\n').find(item => item.startsWith('vmess='));

        expect(line).toBe('vmess=ip.sb:443, method=none, password=6f4e029b-099f-45f6-afd2-33f0e8f86f15, obfs=wss, obfs-uri=/vmess-argo?ed=2560, obfs-host=gbwarp.owg.dpdns.org, tag=🌍 VMESS 节点');
        expect(line).not.toContain('tag=🌍 VMESS 节点, obfs=');
        expect(line).not.toContain('over-tls=true');
        expect(line).not.toContain('tls-host=');
    });

    it('should render SS2022 v2ray-plugin websocket in non-Clash template targets', () => {
        const template = `
[Proxy]
custom_proxy_group=TestGroup`;
        const surgeRendered = renderSurgeFromIniTemplate(template, { nodeList: SS2022_V2RAY_PLUGIN_NODE, targetFormat: 'surge&ver=4' });
        const loonRendered = renderLoonFromIniTemplate(template, { nodeList: SS2022_V2RAY_PLUGIN_NODE, targetFormat: 'loon' });
        const quanxRendered = renderQuanxFromIniTemplate(template, { nodeList: SS2022_V2RAY_PLUGIN_NODE, targetFormat: 'quanx' });
        const singboxRendered = renderSingboxFromIniTemplate(template, { nodeList: SS2022_V2RAY_PLUGIN_NODE, targetFormat: 'singbox' });
        const singbox = JSON.parse(singboxRendered);
        const ssOutbound = singbox.outbounds.find(outbound => outbound.type === 'shadowsocks');

        expect(surgeRendered).toContain('encrypt-method=2022-blake3-aes-256-gcm');
        expect(surgeRendered).toContain('ws=true');
        expect(surgeRendered).toContain('ws-path=/?enc=2022-blake3-aes-256-gcm');
        expect(surgeRendered).toContain('ws-headers=Host:ss.2227tsj.workers.dev');

        expect(loonRendered).toContain('transport=ws');
        expect(loonRendered).toContain('path=/?enc=2022-blake3-aes-256-gcm');
        expect(loonRendered).toContain('host=ss.2227tsj.workers.dev');

        expect(quanxRendered).toContain('method=2022-blake3-aes-256-gcm');
        expect(quanxRendered).toContain('obfs=ws');
        expect(quanxRendered).toContain('obfs-uri=/?enc=2022-blake3-aes-256-gcm');
        expect(quanxRendered).toContain('obfs-host=ss.2227tsj.workers.dev');

        expect(ssOutbound?.method).toBe('2022-blake3-aes-256-gcm');
        expect(ssOutbound?.transport?.type).toBe('ws');
        expect(ssOutbound?.transport?.path).toBe('/?enc=2022-blake3-aes-256-gcm');
        expect(ssOutbound?.transport?.headers?.Host).toBe('ss.2227tsj.workers.dev');
        expect(ssOutbound?.tls).toBeUndefined();
    });

    it('should convert ACL4SSR list rules into clash yaml providers', () => {
        const builtinTemplate = getBuiltinTemplate('clash_acl4ssr_lite');
        const rendered = renderClashFromIniTemplate(builtinTemplate.content, {
            nodeList: [
                'trojan://password@1.2.3.4:443#HK-01',
                'trojan://password@1.2.3.5:443#JP-01',
                'trojan://password@1.2.3.6:443#US-01'
            ].join('\n'),
            targetFormat: 'clash'
        });

        const parsed = yaml.load(rendered);
        const providers = parsed['rule-providers'] || {};
        const providerUrls = Object.values(providers).map(provider => provider.url);

        expect(providerUrls.length).toBeGreaterThan(0);
        expect(providerUrls.every(url => String(url).startsWith('https://cdn.jsdelivr.net/gh/'))).toBe(true);
        expect(providerUrls.some(url => String(url).includes('/Clash/Providers/Ruleset/YouTube.yaml'))).toBe(true);
        expect(providerUrls.some(url => String(url).includes('/Clash/Providers/ProxyGFWlist.yaml'))).toBe(true);
        expect(providerUrls.every(url => !String(url).endsWith('.list'))).toBe(true);
    });
});
