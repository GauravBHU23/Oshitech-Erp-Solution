from django.conf import settings
from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView


def health(_request):
    return JsonResponse({"status": "ok"})


urlpatterns = [
    path(settings.ADMIN_URL, admin.site.urls),
    path("api/health/", health),
    path("api/v1/auth/", include("apps.accounts.urls")),
    path("api/v1/", include("apps.schools.urls")),
    path("api/v1/academics/", include("apps.academics.urls")),
    path("api/v1/", include("apps.teachers.urls")),
    path("api/v1/", include("apps.students.urls")),
    path("api/v1/exams/", include("apps.exams.urls")),
    path("api/v1/", include("apps.attendance.urls")),
    path("api/v1/", include("apps.campus.urls")),
    path("api/v1/stre/", include("apps.stre.urls")),
    path("api/v1/", include("apps.core.urls")),
]

if settings.DEBUG:
    urlpatterns += [
        path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
        path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="docs"),
    ]
