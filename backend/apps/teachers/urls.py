from rest_framework.routers import DefaultRouter
from django.urls import path

from .views import (
    AdminTeacherRatingsView,
    MyTeacherRatingsView,
    PublicTeacherDirectoryView,
    PublicTeacherPhotoView,
    TeacherViewSet,
)

router = DefaultRouter()
router.register("teachers", TeacherViewSet, basename="teacher")
urlpatterns = [
    path("teachers/directory/", PublicTeacherDirectoryView.as_view(), name="public-teacher-directory"),
    path("teachers/directory/<uuid:teacher_id>/photo/", PublicTeacherPhotoView.as_view(), name="public-teacher-photo"),
    path("teachers/my-ratings/", MyTeacherRatingsView.as_view(), name="my-teacher-ratings"),
    path("teachers/ratings/", AdminTeacherRatingsView.as_view(), name="admin-teacher-ratings"),
    *router.urls,
]
