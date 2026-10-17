/**
 * LendBook email sender: sends the app's emails from your own Gmail.
 *
 * Setup (once):
 * 1. Go to https://script.google.com → New project. Delete the sample code and paste this whole file.
 * 2. Project Settings (gear icon) → Script Properties → Add script property:
 *      Property: SECRET    Value: a long random text (same value as GMAIL_SCRIPT_SECRET in Cloudflare)
 * 3. Deploy → New deployment → type "Web app":
 *      Execute as: Me      Who has access: Anyone
 *    Click Deploy, allow the Gmail permission, and copy the Web app URL (ends in /exec).
 *    That URL is GMAIL_SCRIPT_URL in Cloudflare.
 *
 * Only requests that carry the SECRET can send mail. Free Gmail allows 100 recipients per day.
 */
function doPost(e) {
  var out = function (obj) {
    return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
  };
  try {
    var secret = PropertiesService.getScriptProperties().getProperty('SECRET');
    var req = JSON.parse(e.postData.contents);
    if (!secret || req.secret !== secret) return out({ ok: false, error: 'bad secret' });
    if (!req.to || !req.subject || !req.text) return out({ ok: false, error: 'missing to/subject/text' });

    var options = { name: req.name || 'LendBook' };
    if (req.replyTo) options.replyTo = req.replyTo;
    MailApp.sendEmail(req.to, req.subject, req.text, options);

    return out({ ok: true, remaining: MailApp.getRemainingDailyQuota() });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  }
}

// Optional: run this once from the editor (select testSend → Run) to check Gmail sending works.
function testSend() {
  MailApp.sendEmail(Session.getActiveUser().getEmail(), 'LendBook test', 'Gmail sending works.');
}
