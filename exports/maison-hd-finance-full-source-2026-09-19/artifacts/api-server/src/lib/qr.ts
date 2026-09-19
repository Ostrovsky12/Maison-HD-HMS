import QRCode from "qrcode";

export async function generateBookingQR(
  bookingId: number,
  guestName: string,
  checkIn: string,
  checkOut: string,
  unitName: string,
): Promise<string> {
  const payload = JSON.stringify({
    b: bookingId,
    g: guestName,
    i: checkIn,
    o: checkOut,
    u: unitName,
    t: Date.now(),
  });

  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: "H",
    margin: 2,
    width: 320,
    color: {
      dark: "#0f172a",
      light: "#f8fafc",
    },
  });
}
