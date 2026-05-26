import { describe, it, expect } from 'vitest';
import { parseComplianceOverride } from '../cursor-compliance-audit.js';
describe('parseComplianceOverride', () => {
    it('treats 1 and true as skip-all', () => {
        expect(parseComplianceOverride('1').skipAll).toBe(true);
        expect(parseComplianceOverride('true').skipAll).toBe(true);
    });
    it('parses comma-separated bead ids', () => {
        const parsed = parseComplianceOverride('bead-a, bead-b');
        expect(parsed.skipAll).toBe(false);
        expect(parsed.beadIds.has('bead-a')).toBe(true);
        expect(parsed.beadIds.has('bead-b')).toBe(true);
    });
});
//# sourceMappingURL=cursor-compliance-audit.test.js.map