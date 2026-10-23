import { buildCustomerFacingTools } from './mcp-tool-schema';

// deliberately reads the real mcp-gateway/configs/appointments.yaml file,
// not a fixture - same discipline scripts/check-mcp-schema-drift.ts
// already applies: proving the mapper against the actual file it
// depends on, not a mock that could silently drift from it.
describe('buildCustomerFacingTools', () => {
  it('returns exactly the 4 customer-facing tools, named correctly', () => {
    const tools = buildCustomerFacingTools();
    const names = tools.map((t) => t.name);

    expect(names).toHaveLength(4);
    expect(names).toEqual(
      expect.arrayContaining(['list_services', 'list_slots', 'create_booking', 'cancel_booking']),
    );
  });

  // A literal, automated proof of the scope restriction below - not an
  // incidental side effect of testing something else.
  it('never includes list_platforms, get_platform, or list_bookings', () => {
    const names = buildCustomerFacingTools().map((t) => t.name);

    expect(names).not.toContain('list_platforms');
    expect(names).not.toContain('get_platform');
    expect(names).not.toContain('list_bookings');
  });

  it('maps required vs optional fields correctly for list_slots', () => {
    const listSlots = buildCustomerFacingTools().find((t) => t.name === 'list_slots')!;
    const schema = listSlots.input_schema as any;

    expect(schema.required).toEqual(['platformId']);
    expect(Object.keys(schema.properties)).toEqual(
      expect.arrayContaining(['platformId', 'serviceId', 'from', 'to', 'onlyOpen']),
    );
    expect(schema.properties.onlyOpen.type).toBe('boolean');
  });

  it('maps every field required for create_booking (none are optional)', () => {
    const createBooking = buildCustomerFacingTools().find((t) => t.name === 'create_booking')!;
    const schema = createBooking.input_schema as any;

    expect(schema.required.sort()).toEqual(
      ['platformId', 'slotId', 'customerName', 'customerEmail'].sort(),
    );
  });

  it('carries each tool\'s real description through from the yaml', () => {
    const cancelBooking = buildCustomerFacingTools().find((t) => t.name === 'cancel_booking')!;
    expect(cancelBooking.description).toContain('cancelToken');
  });
});
