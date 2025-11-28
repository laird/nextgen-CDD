#!/usr/bin/env npx tsx
/**
 * Seed Skills Script
 *
 * Populates the skill library with pre-built analytical skills
 */

import { getSkillLibrary } from '../src/memory/index.js';
import { skillTemplates, type CreateSkillRequest } from '../src/models/index.js';

/**
 * Additional skill definitions beyond templates
 */
const additionalSkills: CreateSkillRequest[] = [
  {
    name: 'management_assessment',
    description: 'Evaluate management team quality and track record',
    category: 'operational',
    parameters: [
      { name: 'team_profiles', type: 'array', description: 'Executive team profiles', required: true },
      { name: 'company_history', type: 'string', description: 'Company history and timeline', required: false },
    ],
    implementation: `Perform a comprehensive management team assessment:

1. Executive Background Analysis:
   - Education and professional credentials
   - Prior company/industry experience
   - Track record of value creation
   - Tenure and stability

2. Team Dynamics:
   - Complementary skill sets
   - Decision-making structure
   - Succession planning
   - Board composition and governance

3. Performance Metrics:
   - Historical financial performance under current team
   - Strategic initiatives executed
   - Crisis management track record
   - Employee retention/satisfaction

4. Reference and Reputation:
   - Industry standing
   - Customer/partner relationships
   - Regulatory relationships

Output format:
- Individual executive assessments
- Team strength/weakness matrix
- Red flags and concerns
- Recommendations for further diligence`,
    tags: ['management', 'operational', 'due-diligence'],
  },

  {
    name: 'customer_concentration_risk',
    description: 'Analyze customer concentration and revenue dependency risks',
    category: 'risk',
    parameters: [
      { name: 'customer_data', type: 'object', description: 'Customer revenue breakdown', required: true },
      { name: 'industry_benchmarks', type: 'object', description: 'Industry concentration benchmarks', required: false },
    ],
    implementation: `Analyze customer concentration risk:

1. Revenue Concentration Metrics:
   - Top 1/5/10 customer % of revenue
   - Herfindahl-Hirschman Index for customer base
   - Year-over-year concentration trends

2. Customer Profile Analysis:
   - Customer industry/sector distribution
   - Geographic distribution
   - Contract terms and renewal rates
   - Payment terms and credit risk

3. Dependency Assessment:
   - Single customer dependencies
   - Platform/ecosystem dependencies
   - Channel partner concentration

4. Risk Scenarios:
   - Impact of losing top customers
   - Contract renewal risk
   - Pricing power assessment

Output format:
- Concentration metrics with industry benchmarks
- Customer risk heat map
- Contract analysis summary
- Mitigation strategies`,
    tags: ['customer', 'risk', 'revenue'],
  },

  {
    name: 'regulatory_risk_assessment',
    description: 'Evaluate regulatory environment and compliance risks',
    category: 'regulatory',
    parameters: [
      { name: 'industry', type: 'string', description: 'Target industry', required: true },
      { name: 'geographies', type: 'array', description: 'Operating geographies', required: true },
      { name: 'known_regulations', type: 'array', description: 'Known applicable regulations', required: false },
    ],
    implementation: `Perform regulatory risk assessment:

1. Regulatory Landscape Mapping:
   - Applicable federal/state/local regulations
   - Industry-specific requirements
   - International compliance (if applicable)
   - Pending regulatory changes

2. Compliance Status:
   - Current compliance posture
   - Historical violations/fines
   - Audit history
   - Required licenses and permits

3. Regulatory Risk Factors:
   - Political/policy risk
   - Enforcement trends
   - Industry lobbying dynamics
   - Regulatory capture risk

4. Future Outlook:
   - Pending legislation
   - Regulatory trends
   - ESG/sustainability requirements
   - Data privacy evolution

Output format:
- Regulatory matrix by jurisdiction
- Compliance gap analysis
- Risk scoring by regulation type
- Recommended compliance investments`,
    tags: ['regulatory', 'compliance', 'risk'],
  },

  {
    name: 'technology_stack_assessment',
    description: 'Evaluate technology infrastructure and technical debt',
    category: 'technology',
    parameters: [
      { name: 'tech_stack', type: 'object', description: 'Current technology stack details', required: true },
      { name: 'it_org', type: 'object', description: 'IT organization structure', required: false },
    ],
    implementation: `Assess technology infrastructure:

1. Architecture Review:
   - System architecture overview
   - Cloud vs on-premise distribution
   - Integration patterns
   - Scalability assessment

2. Technical Debt Analysis:
   - Legacy system dependencies
   - Code quality indicators
   - Documentation completeness
   - Security vulnerabilities

3. IT Operations:
   - Uptime/reliability metrics
   - Incident management
   - Disaster recovery capabilities
   - DevOps maturity

4. Technology Investment:
   - R&D spending as % of revenue
   - Technology roadmap
   - Build vs buy decisions
   - Vendor lock-in risks

Output format:
- Technology stack diagram
- Technical debt quantification
- Security posture assessment
- Investment recommendations`,
    tags: ['technology', 'infrastructure', 'technical-debt'],
  },

  {
    name: 'unit_economics_analysis',
    description: 'Deep dive into unit economics and contribution margins',
    category: 'financial',
    parameters: [
      { name: 'revenue_data', type: 'object', description: 'Revenue breakdown by product/customer', required: true },
      { name: 'cost_data', type: 'object', description: 'Cost structure details', required: true },
      { name: 'growth_data', type: 'object', description: 'Growth metrics', required: false },
    ],
    implementation: `Analyze unit economics:

1. Revenue Per Unit:
   - Average revenue per user/customer (ARPU)
   - Revenue by product line
   - Pricing tiers and mix
   - Discount/promotion impact

2. Cost Per Unit:
   - Customer acquisition cost (CAC)
   - Cost of goods sold per unit
   - Fulfillment/delivery costs
   - Customer service costs

3. Contribution Margin:
   - Gross margin by segment
   - Contribution margin by channel
   - Marginal economics at scale
   - Fixed vs variable cost structure

4. Lifetime Value:
   - Customer lifetime value (LTV)
   - LTV/CAC ratio
   - Payback period
   - Cohort analysis

Output format:
- Unit economics waterfall
- Segment profitability analysis
- Sensitivity analysis
- Path to improved economics`,
    tags: ['financial', 'unit-economics', 'profitability'],
  },

  {
    name: 'market_timing_assessment',
    description: 'Evaluate market timing and cycle position',
    category: 'market_sizing',
    parameters: [
      { name: 'market', type: 'string', description: 'Target market description', required: true },
      { name: 'economic_indicators', type: 'array', description: 'Relevant economic indicators', required: false },
    ],
    implementation: `Assess market timing:

1. Market Cycle Position:
   - Current stage (early, growth, mature, decline)
   - Historical cycle patterns
   - Leading indicators
   - Comparison to similar markets

2. Macro Environment:
   - Economic cycle alignment
   - Interest rate environment
   - Capital availability
   - M&A activity levels

3. Industry Dynamics:
   - Competitive intensity trends
   - Technology disruption stage
   - Regulatory evolution
   - Customer behavior shifts

4. Timing Implications:
   - Entry point assessment
   - Hold period considerations
   - Exit timing scenarios
   - Downside protection needs

Output format:
- Market cycle diagram
- Timing scorecard
- Historical analogies
- Risk-adjusted timing recommendation`,
    tags: ['market', 'timing', 'cycle'],
  },
];

/**
 * Seed all skills
 */
async function seedSkills(): Promise<void> {
  console.log('🚀 Seeding skill library...\n');

  const skillLibrary = getSkillLibrary();
  const systemUser = 'system';

  // Seed template skills
  console.log('Loading template skills...');
  for (const [key, template] of Object.entries(skillTemplates)) {
    try {
      const skill = await skillLibrary.registerSkill(
        {
          name: template.name,
          description: template.description,
          category: template.category,
          parameters: template.parameters.map((p) => ({
            ...p,
            required: p.required ?? false,
          })),
          implementation: template.implementation,
          tags: ['template', template.category],
        },
        systemUser
      );
      console.log(`  ✓ ${skill.name}`);
    } catch (error) {
      console.log(`  ⚠ ${template.name} (may already exist)`);
    }
  }

  // Seed additional skills
  console.log('\nLoading additional skills...');
  for (const skillDef of additionalSkills) {
    try {
      const skill = await skillLibrary.registerSkill(skillDef, systemUser);
      console.log(`  ✓ ${skill.name}`);
    } catch (error) {
      console.log(`  ⚠ ${skillDef.name} (may already exist)`);
    }
  }

  console.log('\n✅ Skill library seeded successfully');
  console.log(`Total skills: ${Object.keys(skillTemplates).length + additionalSkills.length}`);
}

/**
 * List all skills
 */
async function listSkills(): Promise<void> {
  console.log('📚 Current skill library:\n');

  const skillLibrary = getSkillLibrary();
  const skills = await skillLibrary.searchSkills('', 100);

  const byCategory: Record<string, typeof skills> = {};

  for (const skill of skills) {
    const category = skill.skill.category;
    if (!byCategory[category]) {
      byCategory[category] = [];
    }
    byCategory[category].push(skill);
  }

  for (const [category, categorySkills] of Object.entries(byCategory)) {
    console.log(`\n${category.toUpperCase()}:`);
    for (const skill of categorySkills) {
      console.log(`  - ${skill.skill.name}: ${skill.skill.description.substring(0, 60)}...`);
    }
  }
}

/**
 * Main
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--list')) {
    await listSkills();
    return;
  }

  await seedSkills();
}

main().catch((error) => {
  console.error('Failed to seed skills:', error);
  process.exit(1);
});
