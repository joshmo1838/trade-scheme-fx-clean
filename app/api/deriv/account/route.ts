if (!derivResponse.ok) {
  const errorBody = await derivResponse.text();

  console.error("Deriv account request failed:", {
    httpStatus: derivResponse.status,
    response: errorBody
  });

  return NextResponse.json(
    {
      error: "Deriv rejected the account request.",
      derivStatus: derivResponse.status,
      derivMessage: errorBody
    },
    { status: derivResponse.status }
  );
}
