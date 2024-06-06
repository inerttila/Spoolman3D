import React from "react";
import { HttpError, IResourceComponentsProps, useInvalidate, useTranslate } from "@refinedev/core";
import { Create, useForm, useSelect } from "@refinedev/antd";
import { Form, Input, Select, InputNumber, ColorPicker, Button, Typography, Modal } from "antd";
import TextArea from "antd/es/input/TextArea";
import { numberFormatter, numberParser } from "../../utils/parsing";
import { IVendor } from "../vendors/model";
import { IFilament, IFilamentParsedExtras } from "./model";
import { EntityType, useGetFields } from "../../utils/queryFields";
import { ExtraFieldFormItem, StringifiedExtras } from "../../components/extraFields";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { getCurrencySymbol, useCurrency } from "../../utils/settings";
import { searchMatches } from "../../utils/filtering";
import { ExternalFilament, useGetExternalDBFilaments } from "../../utils/queryExternalDB";
import { formatFilamentLabel } from "../spools/functions";
import { FilamentImportModal } from "../../components/filamentImportModal";
import { getOrCreateVendorFromExternal } from "../vendors/functions";

dayjs.extend(utc);

interface CreateOrCloneProps {
  mode: "create" | "clone";
}

type IFilamentRequest = Omit<IFilamentParsedExtras, "id" | "registered"> & {
  vendor_id: number;
};

export const FilamentCreate: React.FC<IResourceComponentsProps & CreateOrCloneProps> = (props) => {
  const t = useTranslate();
  const extraFields = useGetFields(EntityType.filament);
  const currency = useCurrency();
  const [isImportExtOpen, setIsImportExtOpen] = React.useState(false);
  const invalidate = useInvalidate();

  const { form, formProps, formLoading, onFinish, redirect } = useForm<
    IFilament,
    HttpError,
    IFilamentRequest,
    IFilamentParsedExtras
  >();

  if (!formProps.initialValues) {
    formProps.initialValues = {};
  }

  if (props.mode === "clone") {
    // Fix the vendor_id
    if (formProps.initialValues.vendor) {
      formProps.initialValues.vendor_id = formProps.initialValues.vendor.id;
    }
  }

  const handleSubmit = async (redirectTo: "list" | "create") => {
    const values = StringifiedExtras(await form.validateFields());
    await onFinish(values);
    redirect(redirectTo);
  };

  const { selectProps: vendorSelect } = useSelect<IVendor>({
    resource: "vendor",
    optionLabel: "name",
  });

  const importFilament = async (filament: ExternalFilament) => {
    const vendor = await getOrCreateVendorFromExternal(filament.manufacturer);
    await invalidate({
      resource: "vendor",
      invalidates: ["list", "detail"],
    });

    form.setFieldsValue({
      name: filament.name,
      vendor_id: vendor.id,
      material: filament.material,
      density: filament.density,
      diameter: filament.diameter,
      weight: filament.weight,
      spool_weight: filament.spool_weight || undefined,
      color_hex: filament.color_hex,
      settings_extruder_temp: filament.extruder_temp || undefined,
      settings_bed_temp: filament.bed_temp || undefined,
    });
  };

  // Use useEffect to update the form's initialValues when the extra fields are loaded
  // This is necessary because the form is rendered before the extra fields are loaded
  React.useEffect(() => {
    extraFields.data?.forEach((field) => {
      if (formProps.initialValues && field.default_value) {
        const parsedValue = JSON.parse(field.default_value as string);
        form.setFieldsValue({ extra: { [field.key]: parsedValue } });
      }
    });
  }, [form, extraFields.data, formProps.initialValues]);

  return (
    <Create
      title={props.mode === "create" ? t("filament.titles.create") : t("filament.titles.clone")}
      isLoading={formLoading}
      headerButtons={() => (
        <>
          <Button type="primary" onClick={() => setIsImportExtOpen(true)}>
            {t("filament.form.import_external")}
          </Button>
        </>
      )}
      footerButtons={() => (
        <>
          <Button type="primary" onClick={() => handleSubmit("list")}>
            {t("buttons.save")}
          </Button>
          <Button type="primary" onClick={() => handleSubmit("create")}>
            {t("buttons.saveAndAdd")}
          </Button>
        </>
      )}
    >
      <FilamentImportModal
        isOpen={isImportExtOpen}
        onImport={(value) => {
          setIsImportExtOpen(false);
          importFilament(value);
        }}
        onClose={() => setIsImportExtOpen(false)}
      />
      <Form {...formProps} layout="vertical">
        <Form.Item
          label={t("filament.fields.name")}
          help={t("filament.fields_help.name")}
          name={["name"]}
          rules={[
            {
              required: false,
            },
          ]}
        >
          <Input maxLength={64} />
        </Form.Item>
        <Form.Item
          label={t("filament.fields.vendor")}
          name={["vendor_id"]}
          rules={[
            {
              required: false,
            },
          ]}
        >
          <Select
            {...vendorSelect}
            allowClear
            filterSort={(a, b) => {
              return a?.label && b?.label
                ? (a.label as string).localeCompare(b.label as string, undefined, { sensitivity: "base" })
                : 0;
            }}
            filterOption={(input, option) =>
              typeof option?.label === "string" && option?.label.toLowerCase().includes(input.toLowerCase())
            }
          />
        </Form.Item>
        <Form.Item
          label={t("filament.fields.color_hex")}
          name={["color_hex"]}
          rules={[
            {
              required: false,
            },
          ]}
          getValueFromEvent={(e) => {
            return e?.toHex();
          }}
        >
          <ColorPicker format="hex" />
        </Form.Item>
        <Form.Item
          label={t("filament.fields.material")}
          help={t("filament.fields_help.material")}
          name={["material"]}
          rules={[
            {
              required: false,
            },
          ]}
        >
          <Input maxLength={64} />
        </Form.Item>
        <Form.Item
          label={t("filament.fields.price")}
          help={t("filament.fields_help.price")}
          name={["price"]}
          rules={[
            {
              required: false,
              type: "number",
              min: 0,
            },
          ]}
        >
          <InputNumber
            addonAfter={getCurrencySymbol(undefined, currency)}
            precision={2}
            formatter={numberFormatter}
            parser={numberParser}
          />
        </Form.Item>
        <Form.Item
          label={t("filament.fields.density")}
          name={["density"]}
          rules={[
            {
              required: true,
              type: "number",
              min: 0,
              max: 100,
            },
          ]}
        >
          <InputNumber addonAfter="g/cm³" precision={2} formatter={numberFormatter} parser={numberParser} />
        </Form.Item>
        <Form.Item
          label={t("filament.fields.diameter")}
          name={["diameter"]}
          rules={[
            {
              required: true,
              type: "number",
              min: 0,
              max: 10,
            },
          ]}
        >
          <InputNumber addonAfter="mm" precision={2} formatter={numberFormatter} parser={numberParser} />
        </Form.Item>
        <Form.Item
          label={t("filament.fields.weight")}
          help={t("filament.fields_help.weight")}
          name={["weight"]}
          rules={[
            {
              required: false,
              type: "number",
              min: 0,
            },
          ]}
        >
          <InputNumber addonAfter="g" precision={1} />
        </Form.Item>
        <Form.Item
          label={t("filament.fields.spool_weight")}
          help={t("filament.fields_help.spool_weight")}
          name={["spool_weight"]}
          rules={[
            {
              required: false,
              type: "number",
              min: 0,
            },
          ]}
        >
          <InputNumber addonAfter="g" precision={1} />
        </Form.Item>
        <Form.Item
          label={t("filament.fields.settings_extruder_temp")}
          name={["settings_extruder_temp"]}
          rules={[
            {
              required: false,
              type: "number",
              min: 0,
            },
          ]}
        >
          <InputNumber addonAfter="°C" precision={0} />
        </Form.Item>
        <Form.Item
          label={t("filament.fields.settings_bed_temp")}
          name={["settings_bed_temp"]}
          rules={[
            {
              required: false,
              type: "number",
              min: 0,
            },
          ]}
        >
          <InputNumber addonAfter="°C" precision={0} />
        </Form.Item>
        <Form.Item
          label={t("filament.fields.article_number")}
          help={t("filament.fields_help.article_number")}
          name={["article_number"]}
          rules={[
            {
              required: false,
            },
          ]}
        >
          <Input maxLength={64} />
        </Form.Item>
        <Form.Item
          label={t("filament.fields.comment")}
          name={["comment"]}
          rules={[
            {
              required: false,
            },
          ]}
        >
          <TextArea maxLength={1024} />
        </Form.Item>
        <Typography.Title level={5}>{t("settings.extra_fields.tab")}</Typography.Title>
        {extraFields.data?.map((field, index) => (
          <ExtraFieldFormItem key={index} field={field} />
        ))}
      </Form>
    </Create>
  );
};

export default FilamentCreate;
