using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Reflection.Emit;
using System.Reflection.Metadata;
using System.Reflection.Metadata.Ecma335;
using System.Reflection.PortableExecutable;
using System.Text.RegularExpressions;

public static class OemIl
{
    private static readonly Dictionary<ushort, OpCode> Opcodes = typeof(OpCodes)
        .GetFields(BindingFlags.Public | BindingFlags.Static)
        .Where(field => field.FieldType == typeof(OpCode))
        .Select(field => (OpCode)field.GetValue(null))
        .ToDictionary(op => unchecked((ushort)op.Value));

    public static IEnumerable<string> Read(string path, string pattern, bool showIl)
    {
        using var stream = File.OpenRead(path);
        using var image = new PEReader(stream);
        var metadata = image.GetMetadataReader();
        var filter = new Regex(pattern, RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

        foreach (var handle in metadata.MethodDefinitions)
        {
            var method = metadata.GetMethodDefinition(handle);
            if (method.RelativeVirtualAddress == 0)
                continue;

            string name = Describe(metadata, handle);
            if (!filter.IsMatch(name))
                continue;

            yield return name;
            if (!TryReadBody(image, method.RelativeVirtualAddress, out byte[] il, out string failure))
            {
                yield return "  Unreadable method body: " + failure;
                continue;
            }

            for (int index = 0; index < il.Length;)
            {
                int offset = index;
                ushort opcode = il[index++];
                if (opcode == 0xfe)
                    opcode = (ushort)(0xfe00 | il[index++]);

                var op = Opcodes[opcode];
                int size = Size(op.OperandType, il, index);
                string operand = Operand(metadata, op.OperandType, il, index);
                index += size;

                if (showIl || op.FlowControl == FlowControl.Call || op == OpCodes.Ldftn || op == OpCodes.Ldvirtftn || op == OpCodes.Ldstr)
                    yield return $"  IL_{offset:x4} {op.Name} {operand}".TrimEnd();
            }
        }
    }

    private static bool TryReadBody(PEReader image, int rva, out byte[] il, out string failure)
    {
        try
        {
            il = image.GetMethodBody(rva).GetILBytes();
            failure = string.Empty;
            return true;
        }
        catch (BadImageFormatException error)
        {
            il = Array.Empty<byte>();
            failure = error.Message;
            return false;
        }
    }

    private static int Size(OperandType type, byte[] il, int index) => type switch
    {
        OperandType.InlineNone => 0,
        OperandType.ShortInlineBrTarget or OperandType.ShortInlineI or OperandType.ShortInlineVar => 1,
        OperandType.InlineVar => 2,
        OperandType.InlineI8 or OperandType.InlineR => 8,
        OperandType.InlineSwitch => checked(4 + 4 * BitConverter.ToInt32(il, index)),
        _ => 4
    };

    private static string Operand(MetadataReader metadata, OperandType type, byte[] il, int index)
    {
        switch (type)
        {
            case OperandType.InlineNone:
                return string.Empty;
            case OperandType.InlineString:
                return Regex.Escape(metadata.GetUserString(MetadataTokens.UserStringHandle(BitConverter.ToInt32(il, index) & 0x00ffffff)));
            case OperandType.InlineMethod:
            case OperandType.InlineField:
            case OperandType.InlineTok:
            case OperandType.InlineType:
                return Describe(metadata, MetadataTokens.EntityHandle(BitConverter.ToInt32(il, index)));
            case OperandType.ShortInlineBrTarget:
                return $"IL_{index + 1 + unchecked((sbyte)il[index]):x4}";
            case OperandType.InlineBrTarget:
                return $"IL_{index + 4 + BitConverter.ToInt32(il, index):x4}";
            default:
                return BitConverter.ToString(il, index, Size(type, il, index));
        }
    }

    private static string Describe(MetadataReader metadata, EntityHandle handle)
    {
        switch (handle.Kind)
        {
            case HandleKind.MethodDefinition:
                var method = metadata.GetMethodDefinition((MethodDefinitionHandle)handle);
                return Describe(metadata, method.GetDeclaringType()) + "::" + metadata.GetString(method.Name);
            case HandleKind.MemberReference:
                var member = metadata.GetMemberReference((MemberReferenceHandle)handle);
                return Describe(metadata, member.Parent) + "::" + metadata.GetString(member.Name);
            case HandleKind.MethodSpecification:
                return Describe(metadata, metadata.GetMethodSpecification((MethodSpecificationHandle)handle).Method);
            case HandleKind.TypeDefinition:
                var definition = metadata.GetTypeDefinition((TypeDefinitionHandle)handle);
                return QualifiedName(metadata, definition.Namespace, definition.Name);
            case HandleKind.TypeReference:
                var reference = metadata.GetTypeReference((TypeReferenceHandle)handle);
                return QualifiedName(metadata, reference.Namespace, reference.Name);
            case HandleKind.FieldDefinition:
                var field = metadata.GetFieldDefinition((FieldDefinitionHandle)handle);
                return Describe(metadata, field.GetDeclaringType()) + "::" + metadata.GetString(field.Name);
            default:
                return $"[{handle.Kind} 0x{MetadataTokens.GetToken(handle):x8}]";
        }
    }

    private static string QualifiedName(MetadataReader metadata, StringHandle space, StringHandle name)
    {
        string prefix = metadata.GetString(space);
        return prefix.Length == 0 ? metadata.GetString(name) : prefix + "." + metadata.GetString(name);
    }
}


