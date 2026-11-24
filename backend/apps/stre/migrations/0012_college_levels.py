from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('stre', '0011_results'),
    ]

    operations = [
        migrations.AlterField(
            model_name='streregistration',
            name='class_level',
            field=models.CharField(blank=True, choices=[('1', 'Class 1'), ('2', 'Class 2'), ('3', 'Class 3'), ('4', 'Class 4'), ('5', 'Class 5'), ('6', 'Class 6'), ('7', 'Class 7'), ('8', 'Class 8'), ('9', 'Class 9'), ('10', 'Class 10'), ('11', 'Class 11'), ('12', 'Class 12'), ('grad', 'Graduation'), ('pg', 'Post-Graduation')], max_length=4),
        ),
        migrations.AlterField(
            model_name='streregistration',
            name='school_name',
            field=models.CharField(blank=True, help_text='School, or college/university for Class 11+ candidates', max_length=200),
        ),
    ]
