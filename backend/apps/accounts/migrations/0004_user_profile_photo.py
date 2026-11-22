from django.db import migrations, models
import apps.accounts.models


class Migration(migrations.Migration):
    dependencies = [("accounts", "0003_remove_registrationrequest_uniq_pending_portal_registration_and_more")]

    operations = [
        migrations.AddField(
            model_name="user",
            name="profile_photo",
            field=models.FileField(blank=True, upload_to=apps.accounts.models.profile_photo_upload_path),
        ),
    ]
