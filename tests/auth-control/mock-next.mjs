// Only used through the Node test loader; mirrors the Next HTTP primitives.
export class NextRequest extends Request {
  get nextUrl() { return new URL(this.url); }
}
export const NextResponse = {
  json(payload, options) { return Response.json(payload, options); },
};
