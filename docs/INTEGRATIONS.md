# MEDIPAL integration checklist

MEDIPAL intentionally starts with no provider, hospital-service, price, slot,
account, booking or payment seed record. Empty states are expected until an
authorised operator supplies verified data.

## Database

Set `DATABASE_ADMIN_URL` and a least-privilege `DATABASE_URL` in `.env.server`,
then run:

```sh
npm run db:setup
```

Migration `005_eupchar.sql` creates the persistent E-UPCHAR tables. It does not
import hospital/service data. Import only owner-authorised records into
`eupchar_hospitals`, `eupchar_services`, `eupchar_hospital_services`,
`eupchar_service_prices` and `eupchar_appointment_slots`. A service is publicly
shown only when `available = true`; online booking additionally requires
`booking_enabled = true`. A verified price needs an amount, permitted source,
and verification date.

## E-UPCHAR identity gateway

Protected E-UPCHAR endpoints refuse requests unless
`EUPCHAR_AUTH_GATEWAY_SECRET` is set. Put this secret only in the trusted
identity gateway—not in the browser.

After verifying a real Google, email/password, or phone-OTP session, the gateway
may forward a request with:

```text
x-medipal-user-id: <UUID>
x-medipal-auth-timestamp: <unix milliseconds>
x-medipal-auth-signature: HMAC-SHA256(<UUID>.<timestamp>, EUPCHAR_AUTH_GATEWAY_SECRET)
```

The timestamp expires after five minutes. Provision the authenticated person in
`eupchar_users`; only a row whose `role` is `admin` can use the E-UPCHAR admin
write endpoints. Never substitute a browser-selected role or a fixed user id.

## AI Doctor media analysis

Set `AI_BASE_URL`, `AI_API_KEY`, and `AI_MODEL` in `.env.server`. The configured
provider must support OpenAI-compatible chat completions. Text works without
media capability flags.

For vision, confirm the selected model accepts `image_url` content, then set:

```text
AI_SUPPORTS_IMAGES=true
```

For video, install FFmpeg and FFprobe on the application host and set both flags:

```text
AI_SUPPORTS_IMAGES=true
AI_SUPPORTS_VIDEO_FRAMES=true
FFMPEG_PATH=ffmpeg
FFPROBE_PATH=ffprobe
```

MEDIPAL accepts JPG, PNG and WEBP images (5 MB each), or one MP4, WEBM, or MOV
video (20 MB, 90 seconds). Attachments together are capped at 20 MB. Videos are
converted into no more than eight resized temporary frames; the frames are sent
for the active request and the temporary directory is removed immediately.
MEDIPAL tells the model and user that any video answer is frame-based.

The browser first reads `GET /api/ai/capabilities`. It exposes only the three
booleans `text`, `images`, and `videoFrames`; it never returns a provider URL,
model identifier, or credential. Image and video controls stay disabled unless
the configured server confirms the corresponding capability.

## Pickup-location resolution

Ambulance location permission is a one-time browser request made only after the
person actively starts that booking step. Once granted, the app calls
`GET /api/geoapify/reverse?lat=<latitude>&lon=<longitude>` through MEDIPAL's
server-side Geoapify proxy, displays the returned address and a static map
preview, and leaves the pickup address editable. A denied permission, unavailable
GPS, address-lookup failure, or map-preview failure never blocks manual address
entry. MEDIPAL does not continuously track device location.

## Payments and ambulance

Set both Razorpay server keys and the publishable
`VITE_EUPCHAR_RAZORPAY_KEY_ID`; the server recalculates the booking amount and
verifies the payment signature before recording it. Payment verification moves a
booking only to `pending_hospital_confirmation`, never to a falsely confirmed
hospital appointment.

Ambulance listings remain empty until an administrator records and approves a
provider. Provider availability, fare and response figures need their own source
and confirmation time. Live tracking is visible only for a provider with a real
dispatch integration; MEDIPAL never simulates a moving vehicle.
